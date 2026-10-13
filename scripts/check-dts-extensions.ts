// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-extensions.ts
import { existsSync } from "node:fs";
import path from "node:path";

import {
  isWithinDirectory,
  readJsonRecord,
  repositoryRoot,
  stringRecord,
} from "./check-dts-core.ts";
import { bareModuleName, type Problem } from "./check-dts-package.ts";

export type UndeclaredProblem = Extract<Problem, { kind: "undeclared" }>;

// The modules j4k-align's packageExtensions table already adds, by package. A leak
// the table covers is fixed by `j4k-align --fix`; a hand edit would only be
// replaced by it. A test compares this list with the table in align.
export const ALIGN_TABLE_MODULES: Readonly<Record<string, readonly string[]>> = {
  "@fastify/env": ["fastify"],
  "@fastify/formbody": ["fastify"],
  "@fastify/multipart": ["fastify"],
  "@fastify/postgres": ["@types/pg", "fastify"],
  "@fastify/rate-limit": ["fastify"],
  "@fastify/sensible": ["fastify"],
  "@fastify/swagger": ["fastify"],
  "@fastify/swagger-ui": ["fastify"],
  "@fastify/websocket": ["@types/ws", "fastify"],
  "@react-types/shared": ["@types/react"],
  "@typescript-eslint/types": ["typescript"],
  "lucide-react": ["@types/react"],
  mermaid: ["@iconify/types", "@types/d3-selection", "type-fest"],
  "react-aria": ["@types/react"],
  "react-aria-components": ["@types/react"],
  "react-stately": ["@types/react"],
};

const VERSION = String.raw`v?\d+(?:\.(?:\d+|x|\*)){0,2}(?:-[0-9A-Za-z.-]+)?`;
const SIMPLE_BOUNDED = new RegExp(
  String.raw`^(?:[\^~=]?\s*${VERSION}|${VERSION}\s+-\s+${VERSION})$`,
  "u",
);
const COMPARATORS = new RegExp(String.raw`^(?:(?:<=?|>=?)\s*${VERSION}\s*)+$`, "u");

// align's bar for a packageExtensions range: every `||` alternative has an upper
// bound, which rules out `*`, `>=1` and `^1 || >=2`. This accepts only the forms
// that are clearly bounded; anything else falls back to the placeholder.
function isBoundedAbove(range: string): boolean {
  return range.split("||").every((alternative) => {
    const text = alternative.trim();
    return SIMPLE_BOUNDED.test(text) || (COMPARATORS.test(text) && text.includes("<"));
  });
}

// A range from the leaking package's own devDependencies is the one its typings
// were written against; `*` or a protocol spec would resolve to something else.
export function usableRange(range: string | undefined): string | undefined {
  if (range === undefined || /[:/]/u.test(range) || !isBoundedAbove(range)) {
    return undefined;
  }
  return range.trim();
}

export interface Suggestion {
  section: "dependencies" | "peerDependencies";
  range: string | undefined;
}

function typesPackageName(moduleName: string): string {
  return `@types/${moduleName.replace(/^@/u, "").replace("/", "__")}`;
}

export function nearestManifestDependencyNames(leaf: string): Set<string> {
  for (
    let directory = path.dirname(leaf);
    isWithinDirectory(repositoryRoot, directory);
    directory = path.dirname(directory)
  ) {
    const manifestFile = path.join(directory, "package.json");
    if (existsSync(manifestFile)) {
      const manifest = readJsonRecord(manifestFile);
      return new Set(
        ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap(
          (field) => Object.keys(stringRecord(manifest[field])),
        ),
      );
    }
  }
  return new Set();
}

export function suggestExtension(
  problem: UndeclaredProblem,
  hostNames: ReadonlySet<string>,
): [string, Suggestion] {
  const moduleName = bareModuleName(problem.finding.specifier);
  // TS2307 means the module itself is absent; TS7016 and TS2688 mean its types are.
  const candidates =
    problem.finding.code === 2307
      ? [moduleName, typesPackageName(moduleName)]
      : [typesPackageName(moduleName), moduleName];
  const devDependencies = stringRecord(problem.leaking.manifest.devDependencies);
  const declared = candidates.find((candidate) => candidate in devDependencies);
  const name = declared ?? candidates[0] ?? moduleName;
  return [
    name,
    {
      // A host the application also depends on must stay one shared instance.
      section: hostNames.has(name) ? "peerDependencies" : "dependencies",
      range: usableRange(declared === undefined ? undefined : devDependencies[declared]),
    },
  ];
}

export function isCoveredByAlignTable(packageName: string, moduleName: string): boolean {
  return ALIGN_TABLE_MODULES[packageName]?.includes(moduleName) ?? false;
}
