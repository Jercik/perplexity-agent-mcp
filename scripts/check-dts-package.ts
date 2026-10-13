// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-package.ts
import { existsSync } from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";

import {
  readJsonRecord,
  repositoryRoot,
  stringRecord,
  type Finding,
  type LeafReport,
} from "./check-dts-core.ts";

const DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"] as const;
// align rejects packageExtensions keys for these scopes: a first-party package is fixed at its source.
const FIRST_PARTY_SCOPES = ["@j4k/", "@j4k-oss/"] as const;

export function bareModuleName(specifier: string): string {
  if (specifier.startsWith("node:") || isBuiltin(specifier)) {
    return "@types/node";
  }
  const [first = "", second = ""] = specifier.split("/");
  return specifier.startsWith("@") ? `${first}/${second}` : first;
}

export interface LeakingPackage {
  name: string;
  version: string;
  directory: string;
  manifest: Record<string, unknown>;
  firstParty: boolean;
}

export function leakingPackage(finding: Finding): LeakingPackage | undefined {
  if (finding.file === undefined) {
    return undefined;
  }
  const absolute = path.resolve(repositoryRoot, finding.file);
  const marker = `${path.sep}node_modules${path.sep}`;
  const markerIndex = absolute.lastIndexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }
  const [first, second] = absolute.slice(markerIndex + marker.length).split(path.sep);
  if (first === undefined) {
    return undefined;
  }
  const name = first.startsWith("@") && second !== undefined ? `${first}/${second}` : first;
  const directory = path.join(absolute.slice(0, markerIndex + marker.length), name);
  const manifest = readJsonRecord(path.join(directory, "package.json"));
  return {
    name,
    version: typeof manifest.version === "string" ? manifest.version : "unknown version",
    directory,
    manifest,
    firstParty: FIRST_PARTY_SCOPES.some((scope) => name.startsWith(scope)),
  };
}

// Node's lookup: node_modules beside the package and in every ancestor directory.
function isInstalledFor(packageDirectory: string, moduleName: string): boolean {
  for (let directory = packageDirectory; ; directory = path.dirname(directory)) {
    if (existsSync(path.join(directory, "node_modules", moduleName))) {
      return true;
    }
    if (path.dirname(directory) === directory) {
      return false;
    }
  }
}

export type Problem =
  | { kind: "own-declaration"; leaf: string; finding: Finding }
  | { kind: "declared-not-installed"; leaf: string; finding: Finding; leaking: LeakingPackage }
  | { kind: "first-party"; leaf: string; finding: Finding; leaking: LeakingPackage }
  | { kind: "undeclared"; leaf: string; finding: Finding; leaking: LeakingPackage };

// Returns undefined for a finding no dependency declaration can repair: a subpath
// of a package the importing package already depends on and that is installed
// (`fastify/types/schema` from a package that peers on fastify) fails under NodeNext
// for want of an extension in the package's own import.
function classifyFinding(leaf: string, finding: Finding): Problem | undefined {
  const leaking = leakingPackage(finding);
  if (leaking === undefined) {
    return { kind: "own-declaration", leaf, finding };
  }
  const moduleName = bareModuleName(finding.specifier);
  const declared = DEPENDENCY_FIELDS.some(
    (field) => moduleName in stringRecord(leaking.manifest[field]),
  );
  if (declared && !isInstalledFor(leaking.directory, moduleName)) {
    return { kind: "declared-not-installed", leaf, finding, leaking };
  }
  if (declared && finding.code === 2307 && finding.specifier !== moduleName) {
    return undefined;
  }
  return { kind: leaking.firstParty ? "first-party" : "undeclared", leaf, finding, leaking };
}

export function classifyReports(reports: readonly LeafReport[]): {
  problems: Problem[];
  ignoredCount: number;
} {
  const problems: Problem[] = [];
  let ignoredCount = 0;
  for (const report of reports) {
    ignoredCount += report.ignoredCount;
    for (const finding of report.findings) {
      const problem = classifyFinding(report.leaf, finding);
      if (problem === undefined) {
        ignoredCount += 1;
      } else {
        problems.push(problem);
      }
    }
  }
  return { problems, ignoredCount };
}
