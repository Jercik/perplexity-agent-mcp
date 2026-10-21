// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-process.ts
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import path from "node:path";

import { GuardFailureError, repositoryRoot } from "./check-dts-core.ts";

const typescriptBinary = path.join(repositoryRoot, "node_modules", ".bin", "tsc");

export type ProcessResult =
  | { kind: "failed-to-start"; message: string }
  | { kind: "signaled"; signal: string }
  | { kind: "exited"; status: number; stdout: string; stderr: string };

const runningChildren = new Set<ChildProcess>();

export function stopRunningTypeScript(signal: NodeJS.Signals): void {
  for (const child of runningChildren) {
    child.kill(signal);
  }
}

export function runTypeScript(args: readonly string[]): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(typescriptBinary, args, {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningChildren.add(child);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.once("error", (error) => {
      runningChildren.delete(child);
      resolve({ kind: "failed-to-start", message: error.message });
    });
    child.once("close", (status, signal) => {
      runningChildren.delete(child);
      if (signal === null) {
        resolve({
          kind: "exited",
          status: status ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      } else {
        resolve({ kind: "signaled", signal });
      }
    });
  });
}

// A tsc run that cannot be fully understood must never read as a pass.
export function requireOrderlyRun(
  label: string,
  result: ProcessResult,
): { stdout: string; status: number } {
  if (result.kind === "failed-to-start") {
    throw new GuardFailureError(`${label}: cannot start ${typescriptBinary}: ${result.message}`);
  }
  if (result.kind === "signaled") {
    throw new GuardFailureError(`${label}: tsc was terminated by ${result.signal}`);
  }
  if (result.stderr.trim() !== "") {
    throw new GuardFailureError(`${label}: tsc wrote to stderr:\n${result.stderr.trimEnd()}`);
  }
  return { stdout: result.stdout, status: result.status };
}
