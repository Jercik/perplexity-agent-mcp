#!/usr/bin/env node
// Rendered by j4k-align from https://code.j4k.dev/j4k/align/src/branch/main/templates/repo/validate-packed-packages.ts
// Direct edits are drift and are overwritten on the next targeted `--fix`; edit the template.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { publint } from "publint";
import type { Message } from "publint";
import { formatMessage } from "publint/utils";

const USAGE = "usage: validate-packed-packages.ts --packer npm|pnpm";

type Packer = "npm" | "pnpm";

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");

function parsePacker(argv: string[]): Packer {
  let values: { packer?: string | undefined };
  try {
    ({ values } = parseArgs({ args: argv, options: { packer: { type: "string" } }, strict: true }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  if (values.packer === undefined) {
    throw new UsageError("--packer is required");
  }
  if (values.packer !== "npm" && values.packer !== "pnpm") {
    throw new UsageError(`unknown packer ${JSON.stringify(values.packer)}`);
  }
  return values.packer;
}

function readManifest(manifestDirectory: string): Record<string, unknown> {
  const manifestPath = path.join(manifestDirectory, "package.json");
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof manifest !== "object" || manifest === null) {
    throw new TypeError(`${manifestPath} is not a JSON object`);
  }
  return manifest as Record<string, unknown>;
}

function isPrivate(manifestDirectory: string): boolean {
  return readManifest(manifestDirectory).private === true;
}

// `pnpm publish -r` skips private, unnamed and unversioned packages, which excludes a private root.
function isPublishedByPnpm(manifestDirectory: string): boolean {
  const manifest = readManifest(manifestDirectory);
  return (
    manifest.private !== true &&
    typeof manifest.name === "string" &&
    typeof manifest.version === "string"
  );
}

function pnpmPublishedPackages(): string[] {
  if (!isPrivate(repositoryRoot)) {
    throw new Error("the workspace root must be private when pnpm publishes its members");
  }
  const members: unknown = JSON.parse(
    execFileSync("pnpm", ["list", "-r", "--depth", "-1", "--json"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }),
  );
  if (!Array.isArray(members)) {
    throw new TypeError("pnpm list did not return a list of workspace members");
  }
  const paths = (members as ({ path?: unknown } | null)[]).map((member) => {
    const memberPath = member?.path;
    if (typeof memberPath !== "string" || !path.isAbsolute(memberPath)) {
      throw new TypeError("pnpm list returned a member without an absolute path");
    }
    return memberPath;
  });
  const published = paths.filter((memberPath) => isPublishedByPnpm(memberPath));
  if (published.length === 0) {
    throw new Error("no workspace member is published");
  }
  return published;
}

// npm publishes the repository root, which must not be private.
function npmPublishedPackages(): string[] {
  if (isPrivate(repositoryRoot)) {
    throw new Error("the repository root is private, so npm would not publish it");
  }
  return [repositoryRoot];
}

function pack(packer: Packer, packagePath: string, destination: string): string {
  const args =
    packer === "npm"
      ? ["pack", packagePath, "--pack-destination", destination]
      : ["--dir", packagePath, "pack", "--pack-destination", destination];
  execFileSync(packer, args, { cwd: repositoryRoot, stdio: ["ignore", 2, 2] });
  const tarballs = readdirSync(destination).filter((name) => name.endsWith(".tgz"));
  const [tarball] = tarballs;
  if (tarballs.length !== 1 || tarball === undefined) {
    throw new Error(`${packer} pack produced ${tarballs.length} tarballs for ${packagePath}`);
  }
  return path.join(destination, tarball);
}

// publint reports a subpath pattern that matches no packed file only as a warning, but the
// export it names is broken for every consumer.
function failsPackage(message: Message): boolean {
  return message.type === "error" || message.code === "EXPORTS_GLOB_NO_MATCHED_FILES";
}

async function validate(packer: Packer): Promise<string> {
  const packages = packer === "npm" ? npmPublishedPackages() : pnpmPublishedPackages();
  const version = execFileSync(packer, ["--version"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "packed-packages-"));
  try {
    const failures: string[] = [];
    for (const [index, packagePath] of packages.entries()) {
      const destination = path.join(temporaryDirectory, String(index));
      mkdirSync(destination);
      const tarball = readFileSync(pack(packer, packagePath, destination));
      const { messages, pkg } = await publint({
        pack: { tarball: new Uint8Array(tarball).buffer },
        level: "warning",
      });
      if (pkg === undefined) {
        throw new Error("the installed publint cannot validate a packed tarball");
      }
      const label = path.relative(repositoryRoot, packagePath) || ".";
      for (const message of messages.filter((candidate) => failsPackage(candidate))) {
        failures.push(`${label}: ${formatMessage(message, pkg) ?? message.code}`);
      }
    }
    if (failures.length > 0) {
      throw new Error(`packed with ${packer} ${version}:\n${failures.join("\n")}`);
    }
    const packageWord = packages.length === 1 ? "package" : "packages";
    return `Validated ${packages.length} packed ${packageWord} with ${packer} ${version}.`;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  console.log(await validate(parsePacker(process.argv.slice(2))));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`validate-packed-packages: ${message}`);
  if (error instanceof UsageError) {
    console.error(USAGE);
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}
