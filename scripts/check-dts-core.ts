// Managed by j4k-align: https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/check-dts/check-dts-core.ts
import { readFileSync } from "node:fs";
import path from "node:path";

export const repositoryRoot = path.resolve(import.meta.dirname, "..");

export class GuardFailureError extends Error {
  override name = "GuardFailureError";
}

export interface Diagnostic {
  file: string | undefined;
  code: number;
  message: string;
  line: string;
}

// A resolution diagnostic naming a module some dependency could in principle declare.
export interface Finding extends Diagnostic {
  specifier: string;
}

export interface LeafReport {
  leaf: string;
  findings: Finding[];
  ignoredCount: number;
}

export function isWithinDirectory(base: string, target: string): boolean {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readJsonRecord(file: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed)) {
    throw new GuardFailureError(`${file} is not a JSON object`);
  }
  return parsed;
}

export function stringRecord(value: unknown): Record<string, string> {
  const entries = isRecord(value)
    ? Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
    : [];
  return Object.fromEntries(entries);
}

// Relative and absolute specifiers name files the package forgot to publish; no
// dependency declaration repairs them.
export function moduleSpecifier(diagnostic: Diagnostic): string | undefined {
  const specifier = /'(?<specifier>[^']+)'/u.exec(diagnostic.message)?.groups?.specifier;
  if (specifier === undefined || specifier.startsWith(".") || path.isAbsolute(specifier)) {
    return undefined;
  }
  return specifier;
}
