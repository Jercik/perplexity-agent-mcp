// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-roots.ts
import path from "node:path";

import { GuardFailureError, isRecord, readJsonRecord, repositoryRoot } from "./check-dts-core.ts";

// Flags that leave `tsc -b` checking the same projects; any other flag is refused
// instead of guessed at, because a flag such as `--clean` or `--watch` changes what runs.
const BUILD_FLAGS = new Set([
  "--noEmit",
  "--force",
  "-f",
  "--verbose",
  "-v",
  "--dry",
  "-d",
  "--pretty",
  "--stopBuildOnErrors",
]);
// Outside build mode a project flag or an input file would change what tsc checks.
const CHECK_FLAGS = new Set(["--noEmit"]);
// Every accepted flag is boolean, and tsc reads one of these right after it as the flag's value.
const BOOLEAN_VALUES = new Set(["true", "false", "null"]);
// Plain path characters only: quotes, `$`, globs and every shell operator stay out.
const PLAIN_TOKEN = /^[\w@%+=:,./-]+$/u;

function refuse(command: string, reason: string): never {
  throw new GuardFailureError(
    `package.json scripts.typecheck (${JSON.stringify(command)}) ${reason}; ` +
      'the guard takes its roots from a plain "tsc -b [projects]" (or "--build"), "tsc --noEmit" or bare "tsc" command',
  );
}

// The projects `typecheck` builds, which are the roots of the reference graph the
// guard walks. A bare `tsc -b` builds `tsconfig.json`; a directory means its `tsconfig.json`.
// Outside build mode, `tsc --noEmit` (a flat-layout `typecheck`) checks `tsconfig.json`.
function parseTypecheckProjects(command: string): string[] {
  const plain = command.split(/\s+/u).filter((token) => token !== "");
  const unplain = plain.find((token) => !PLAIN_TOKEN.test(token));
  if (unplain !== undefined) {
    return refuse(command, `contains the shell syntax ${JSON.stringify(unplain)}`);
  }
  if (plain[0] !== "tsc") {
    return refuse(command, "does not start with tsc");
  }
  const buildMode = plain[1] === "-b" || plain[1] === "--build";
  const flags = buildMode ? BUILD_FLAGS : CHECK_FLAGS;
  const args = plain.slice(buildMode ? 2 : 1);
  const projects: string[] = [];
  for (const [index, token] of args.entries()) {
    if (BOOLEAN_VALUES.has(token) && flags.has(args[index - 1] ?? "")) {
      continue;
    }
    if (token.startsWith("-")) {
      if (!flags.has(token)) {
        return refuse(command, `uses the flag ${token}`);
      }
    } else if (buildMode) {
      projects.push(token);
    } else {
      return refuse(command, `names the input file ${token} outside build mode`);
    }
  }
  return (projects.length === 0 ? ["tsconfig.json"] : projects).map((project) => {
    const resolved = path.resolve(repositoryRoot, project);
    return resolved.endsWith(".json") ? resolved : path.join(resolved, "tsconfig.json");
  });
}

export function typecheckProjects(): string[] {
  const { scripts } = readJsonRecord(path.join(repositoryRoot, "package.json"));
  const command = isRecord(scripts) ? scripts.typecheck : undefined;
  if (typeof command !== "string") {
    throw new GuardFailureError(
      "package.json has no typecheck script, so the guard cannot tell which projects to check",
    );
  }
  return parseTypecheckProjects(command);
}
