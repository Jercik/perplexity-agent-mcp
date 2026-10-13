// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts.ts
import { availableParallelism, constants } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { GuardFailureError, repositoryRoot, type LeafReport } from "./check-dts-core.ts";
import { assertSupportedInstallLayout } from "./check-dts-layout.ts";
import { classifyReports } from "./check-dts-package.ts";
import { stopRunningTypeScript } from "./check-dts-process.ts";
import { formatFailure } from "./check-dts-report.ts";
import { checkLeaf, describeConfig, removePendingOverlays } from "./check-dts-tsc.ts";

// TypeScript 7 runs each process multithreaded, so one process per core
// oversubscribes a large CI runner; the cap bounds the processes in flight.
const MAX_CONCURRENT_LEAVES = 4;

// Run after `typecheck`: it builds the workspace declarations the leaves import.
// `tsc -p` on a solution-style root type-checks nothing, so every leaf of the
// reference graph gets its own run.
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
  await visit(path.join(repositoryRoot, "tsconfig.json"));
  if (leaves.length === 0) {
    throw new GuardFailureError(
      "no tsconfig reachable from tsconfig.json through references has input files, so there is nothing to check",
    );
  }
  return leaves;
}

async function main(): Promise<number> {
  if (process.argv.length !== 2) {
    throw new GuardFailureError("this script accepts no arguments");
  }
  assertSupportedInstallLayout();
  const leaves = await collectLeaves();
  const checked = (await Readable.from(leaves)
    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Readable.map takes an options object, not a thisArg.
    .map((leaf: string) => checkLeaf(leaf), {
      concurrency: Math.min(MAX_CONCURRENT_LEAVES, Math.max(1, availableParallelism() - 2)),
    })
    .toArray()) as LeafReport[];
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

// An interrupted run would leave its overlay configs next to the real ones.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopRunningTypeScript(signal);
    removePendingOverlays();
    process.exit(128 + constants.signals[signal]);
  });
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(
    `check:dts: ${error instanceof GuardFailureError ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
