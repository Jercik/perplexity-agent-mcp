// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-run.ts
import path from "node:path";

import { GuardFailureError, repositoryRoot } from "./check-dts-core.ts";
import type { LeafReport } from "./check-dts-core.ts";
import { assertSupportedInstallLayout } from "./check-dts-layout.ts";
import { classifyReports } from "./check-dts-package.ts";
import { formatFailure } from "./check-dts-report.ts";
import { typecheckProjects } from "./check-dts-roots.ts";
import { checkLeaf, describeConfig } from "./check-dts-tsc.ts";

// `tsc -p` on a solution-style root type-checks nothing, so every leaf of the
// reference graph gets its own run, starting at the projects `typecheck` checks.
async function collectLeaves(): Promise<string[]> {
  const leaves: string[] = [];
  const seen = new Set<string>();
  async function visit(configFile: string): Promise<void> {
    if (seen.has(configFile)) {
      return;
    }
    seen.add(configFile);
    const { hasInputs, references } = await describeConfig(configFile);
    if (hasInputs) {
      leaves.push(configFile);
    }
    for (const reference of references) {
      const target = path.resolve(path.dirname(configFile), reference);
      await visit(target.endsWith(".json") ? target : path.join(target, "tsconfig.json"));
    }
  }
  const roots = typecheckProjects();
  for (const root of roots) {
    await visit(root);
  }
  if (leaves.length === 0) {
    throw new GuardFailureError(
      `no tsconfig reachable from ${roots.map((root) => path.relative(repositoryRoot, root)).join(", ")} through references has input files, so there is nothing to check`,
    );
  }
  return leaves;
}

async function checkLeaves(leaves: string[]): Promise<LeafReport[]> {
  const reports: LeafReport[] = [];
  for (const leaf of leaves) {
    reports.push(await checkLeaf(leaf));
  }
  return reports;
}

async function run(): Promise<number> {
  if (process.argv.length !== 2) {
    throw new GuardFailureError("this script accepts no arguments");
  }
  assertSupportedInstallLayout();
  const leaves = await collectLeaves();
  const checked = await checkLeaves(leaves);
  const { problems, ignoredCount } = classifyReports(checked);
  if (problems.length > 0) {
    process.stderr.write(`${formatFailure(problems)}\n`);
    return 1;
  }
  const projectWord = leaves.length === 1 ? "project" : "projects";
  process.stdout.write(
    `check:dts: ${leaves.length} ${projectWord} checked, no unresolved imports in dependency typings` +
      `${ignoredCount === 0 ? "" : ` (${ignoredCount} unrelated dependency diagnostics ignored)`}\n`,
  );
  return 0;
}

// Settles the run into an exit code; it never rejects. The entry script calls it
// without a top-level await, which would stop `require(esm)` from loading it.
export async function main(): Promise<void> {
  try {
    process.exitCode = await run();
  } catch (error) {
    process.stderr.write(
      `check:dts: ${error instanceof GuardFailureError ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
