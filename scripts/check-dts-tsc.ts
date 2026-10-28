// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-tsc.ts
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { GuardFailureError, isRecord, moduleSpecifier, repositoryRoot } from "./check-dts-core.ts";
import type { Diagnostic, Finding, LeafReport } from "./check-dts-core.ts";
import { requireOrderlyRun, runTypeScript } from "./check-dts-process.ts";
import type { ProcessResult } from "./check-dts-process.ts";

// Codes that mean an import or reference in a declaration file did not resolve.
// Which codes count, and why the neighbouring ones do not, is decision 10 of
// https://code.j4k.dev/j4k/align/src/branch/main/docs/adr/0005-declaration-resolution-guard-and-out-of-tree-ci-store.md
const RESOLUTION_ERROR_CODES: ReadonlySet<number> = new Set([
  2307, 2882, 7016, 2688, 2726, 2727, 2591, 2580,
]);
const DIAGNOSTIC_LINE = /^(?:(?<file>.+?)\(\d+,\d+\): )?error TS(?<code>\d+): (?<message>.*)$/u;
const INSIDE_NODE_MODULES = /(?:^|\/)node_modules\//u;
// The project's typecheck skips the repository's own declaration files (it sets
// skipLibCheck), so a type error in one does not invalidate this run; an
// unresolved bare import there is still a finding.
const OWN_DECLARATION_FILE = /\.d\.[cm]?ts$/u;

function parseDiagnostics(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const line of output.split("\n")) {
    const groups = DIAGNOSTIC_LINE.exec(line)?.groups;
    if (groups?.code !== undefined && groups.message !== undefined) {
      diagnostics.push({
        file: groups.file,
        code: Number(groups.code),
        message: groups.message,
        line,
      });
    }
  }
  return diagnostics;
}

function isConfigurationCode(code: number): boolean {
  return (code >= 5000 && code < 7000) || code === 18_003;
}

function interpretLeafRun(leaf: string, result: ProcessResult): LeafReport {
  const label = path.relative(repositoryRoot, leaf);
  const { stdout, status } = requireOrderlyRun(label, result);
  if (status === 0) {
    if (stdout.trim() !== "") {
      throw new GuardFailureError(`${label}: tsc exited 0 but printed:\n${stdout.trimEnd()}`);
    }
    return { leaf, findings: [], ignoredCount: 0 };
  }

  const diagnostics = parseDiagnostics(stdout);
  if (diagnostics.length === 0) {
    throw new GuardFailureError(
      `${label}: tsc exited ${status} without an "error TS" line:\n${stdout.trimEnd()}`,
    );
  }
  // Any configuration error, and any error in the repository's own sources,
  // means the run did not check what it was meant to check; type errors in
  // dependency typings unrelated to resolution are not this guard's concern.
  const unexplained = diagnostics.filter(
    (diagnostic) =>
      isConfigurationCode(diagnostic.code) ||
      diagnostic.file === undefined ||
      !(INSIDE_NODE_MODULES.test(diagnostic.file) || OWN_DECLARATION_FILE.test(diagnostic.file)),
  );
  if (unexplained.length > 0) {
    throw new GuardFailureError(
      `${label}: tsc reported errors outside dependency typings:\n${unexplained.map((diagnostic) => diagnostic.line).join("\n")}`,
    );
  }
  const findings = diagnostics.flatMap((diagnostic): Finding[] => {
    const specifier = RESOLUTION_ERROR_CODES.has(diagnostic.code)
      ? moduleSpecifier(diagnostic)
      : undefined;
    return specifier === undefined ? [] : [{ ...diagnostic, specifier }];
  });
  return { leaf, findings, ignoredCount: diagnostics.length - findings.length };
}

export async function describeConfig(
  configFile: string,
): Promise<{ hasInputs: boolean; references: string[] }> {
  const label = path.relative(repositoryRoot, configFile);
  const { stdout, status } = requireOrderlyRun(
    label,
    await runTypeScript(["-p", configFile, "--showConfig"]),
  );
  if (status !== 0) {
    throw new GuardFailureError(
      `${label}: tsc --showConfig exited ${status}:\n${stdout.trimEnd()}`,
    );
  }
  let shown: unknown;
  try {
    shown = JSON.parse(stdout);
  } catch (error) {
    throw new GuardFailureError(`${label}: tsc --showConfig printed no JSON`, { cause: error });
  }
  if (!isRecord(shown)) {
    throw new GuardFailureError(`${label}: tsc --showConfig printed no JSON object`);
  }
  const references = Array.isArray(shown.references)
    ? shown.references.flatMap((reference: unknown) =>
        isRecord(reference) && typeof reference.path === "string" ? [reference.path] : [],
      )
    : [];
  const hasInputs = Array.isArray(shown.files) && shown.files.length > 0;
  // TypeScript 6 reports TS18003 for a config without inputs; TypeScript 7 prints it
  // without a files list and exits 0, so only a config with references may be empty.
  if (!hasInputs && references.length === 0) {
    throw new GuardFailureError(
      `${label}: has no input files and no references, so it checks nothing`,
    );
  }
  return { hasInputs, references };
}

const pendingOverlays = new Set<string>();

export function removePendingOverlays(): void {
  for (const overlay of pendingOverlays) {
    rmSync(overlay, { force: true });
  }
  pendingOverlays.clear();
}

// The overlay sits beside the leaf because TypeScript derives the default `types`
// lookup (node_modules/@types, walking up) from the directory of the config it was
// given, not from the config it extends.
export async function checkLeaf(leaf: string): Promise<LeafReport> {
  const overlay = path.join(path.dirname(leaf), `.tsconfig.check-dts.${path.basename(leaf)}`);
  pendingOverlays.add(overlay);
  try {
    writeFileSync(
      overlay,
      JSON.stringify({
        extends: `./${path.basename(leaf)}`,
        compilerOptions: {
          skipLibCheck: false,
          noEmit: true,
          composite: false,
          incremental: false,
          declaration: false,
          declarationMap: false,
          emitDeclarationOnly: false,
          // Each of these is an error (TS5069) without the declaration or incremental
          // option switched off above, so a leaf that sets one needs it cleared.
          declarationDir: null,
          isolatedDeclarations: false,
          tsBuildInfoFile: null,
        },
        references: [],
      }),
    );
    return interpretLeafRun(leaf, await runTypeScript(["-p", overlay, "--pretty", "false"]));
  } finally {
    rmSync(overlay, { force: true });
    pendingOverlays.delete(overlay);
  }
}
