// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-report.ts
import path from "node:path";

import { repositoryRoot } from "./check-dts-core.ts";
import type { Finding } from "./check-dts-core.ts";
import {
  isCoveredByAlignTable,
  nearestManifestDependencyNames,
  suggestExtension,
} from "./check-dts-extensions.ts";
import type { Suggestion } from "./check-dts-extensions.ts";
import type { LeakingPackage, Problem } from "./check-dts-package.ts";

type ProblemOfKind<Kind extends Problem["kind"]> = Extract<Problem, { kind: Kind }>;

function problemsOfKind<Kind extends Problem["kind"]>(
  problems: readonly Problem[],
  kind: Kind,
): ProblemOfKind<Kind>[] {
  return problems.filter((problem): problem is ProblemOfKind<Kind> => problem.kind === kind);
}

function describeLeak(problem: { leaking: LeakingPackage; finding: Finding }): string {
  return `${problem.leaking.name}@${problem.leaking.version}: ${problem.finding.line}`;
}

function describeOrigin(problem: {
  leaking: LeakingPackage | undefined;
  finding: Finding;
}): string {
  return problem.leaking === undefined
    ? problem.finding.line
    : describeLeak({ ...problem, leaking: problem.leaking });
}

function isCovered(problem: ProblemOfKind<"undeclared">): boolean {
  const [moduleName] = suggestExtension(problem, new Set());
  return isCoveredByAlignTable(problem.leaking.name, moduleName);
}

function formatExtensions(allProblems: readonly ProblemOfKind<"undeclared">[]): string[] {
  const covered = allProblems.filter((problem) => isCovered(problem));
  const problems = allProblems.filter((problem) => !isCovered(problem));
  const lines: string[] = [];
  if (covered.length > 0) {
    lines.push(
      "",
      "Imported without being declared, and j4k-align's packageExtensions table adds the module. Run `j4k-align --fix-local --yes --repo OWNER/REPO --local-path /path/to/checkout` (replace OWNER/REPO and /path/to/checkout), relock, and rerun; do not hand-edit pnpm-workspace.yaml for these:",
      ...covered.map((problem) => `  ${describeLeak(problem)}`),
    );
  }
  if (problems.length > 0) {
    lines.push(...formatHandWrittenExtensions(problems));
  }
  return lines;
}

function formatHandWrittenExtensions(problems: readonly ProblemOfKind<"undeclared">[]): string[] {
  const hostNamesByLeaf = new Map<string, Set<string>>();
  const extensions = new Map<string, Map<string, Suggestion>>();
  for (const problem of problems) {
    const hostNames =
      hostNamesByLeaf.get(problem.leaf) ?? nearestManifestDependencyNames(problem.leaf);
    hostNamesByLeaf.set(problem.leaf, hostNames);
    const [moduleName, suggestion] = suggestExtension(problem, hostNames);
    extensions.set(
      problem.leaking.name,
      (extensions.get(problem.leaking.name) ?? new Map<string, Suggestion>()).set(
        moduleName,
        suggestion,
      ),
    );
  }

  const lines = [
    "",
    "Imported without being declared. Add to packageExtensions in pnpm-workspace.yaml, relock, and rerun. A <range> placeholder needs a human: use a range with an upper bound that the typings were written against (align rejects *, >=1 and ^1 || >=2).",
    ...problems.map((problem) => `  ${describeLeak(problem)}`),
    "",
    "packageExtensions:",
  ];
  // A bare name covers every installed version of the package.
  for (const [name, modules] of extensions) {
    lines.push(`  ${JSON.stringify(name)}:`);
    for (const section of ["dependencies", "peerDependencies"] as const) {
      const entries = [...modules].filter(([, suggestion]) => suggestion.section === section);
      if (entries.length > 0) {
        lines.push(`    ${section}:`);
        for (const [moduleName, suggestion] of entries) {
          lines.push(
            `      ${JSON.stringify(moduleName)}: ${JSON.stringify(suggestion.range ?? "<range>")}`,
          );
        }
      }
    }
  }
  return lines;
}

// One entry per package and module: a package that misses one module reports it from every file that imports it.
function distinctProblems(problems: readonly Problem[]): Problem[] {
  const distinct = new Map<string, Problem>();
  for (const problem of problems) {
    const owner =
      problem.kind === "own-declaration" || problem.leaking === undefined
        ? "this repository"
        : `${problem.leaking.name}@${problem.leaking.version}`;
    // Node typings are added per project, so the same import in another project is another repair.
    const scope = problem.kind === "node-types" ? ` ${problem.leaf}` : "";
    const key = `${owner} ${problem.finding.specifier}${scope}`;
    if (!distinct.has(key)) {
      distinct.set(key, problem);
    }
  }
  return [...distinct.values()];
}

export function formatFailure(allProblems: readonly Problem[]): string {
  const problems = distinctProblems(allProblems);
  const lines = [
    `check:dts: ${problems.length} unresolved ${problems.length === 1 ? "import" : "imports"} in declaration files; the imported types degrade to any.`,
  ];
  const own = problemsOfKind(problems, "own-declaration");
  if (own.length > 0) {
    lines.push(
      "",
      "Imported by this repository's own declaration files. Add the module to this repository's dependencies:",
      ...own.map((problem) => `  ${problem.finding.line}`),
    );
  }
  const notInstalled = problemsOfKind(problems, "declared-not-installed");
  if (notInstalled.length > 0) {
    lines.push(
      "",
      "Declared by the importing package but not installed, as with an optional peer. Add the module to this repository's dependencies:",
      ...notInstalled.map((problem) => `  ${describeLeak(problem)}`),
    );
  }
  const nodeTypes = problemsOfKind(problems, "node-types");
  if (nodeTypes.length > 0) {
    lines.push(
      "",
      'Node typings are not part of the program, so the Node builtins and globals these typings use degrade to any. A packageExtensions entry cannot repair it, because an ambient module is visible only to a program that includes @types/node. Add @types/node to this repository\'s devDependencies and "node" to compilerOptions.types of each project (with types ["*"] the install is enough):',
      ...nodeTypes.map(
        (problem) => `  ${path.relative(repositoryRoot, problem.leaf)}: ${describeOrigin(problem)}`,
      ),
    );
  }
  const libraries = problemsOfKind(problems, "unresolved-lib");
  if (libraries.length > 0) {
    lines.push(
      "",
      "Referenced by a `/// <reference lib>` directive naming a lib this TypeScript release does not ship. No dependency declaration repairs it: upgrade TypeScript to a release that ships the lib, or the package to one that no longer asks for it:",
      ...libraries.map((problem) => `  ${describeOrigin(problem)}`),
    );
  }
  const firstParty = problemsOfKind(problems, "first-party");
  if (firstParty.length > 0) {
    lines.push(
      "",
      "Imported without being declared by a first-party package. Fix at the source (declare the dependency in that package):",
      ...firstParty.map((problem) => `  ${describeLeak(problem)}`),
    );
  }
  const undeclared = problemsOfKind(problems, "undeclared");
  if (undeclared.length > 0) {
    lines.push(...formatExtensions(undeclared));
  }
  return lines.join("\n");
}
