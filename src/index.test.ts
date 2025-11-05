import packageJson from "../package.json" with { type: "json" };
import { afterEach, describe, expect, it, vi } from "vitest";

class ExitError extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code ?? 0})`);
    this.name = "ExitError";
  }
}

const importCli = () => import("./index.ts");

const originalArgv = [...process.argv];
const originalApiKey = process.env.PERPLEXITY_API_KEY;

afterEach(() => {
  process.argv = [...originalArgv];
  if (originalApiKey === undefined) {
    delete process.env.PERPLEXITY_API_KEY;
  } else {
    process.env.PERPLEXITY_API_KEY = originalApiKey;
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("CLI entry point", () => {
  it("prints the package version when --version is provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new ExitError(code);
    }) as never);

    process.argv = ["node", "index.ts", "--version"];
    delete process.env.PERPLEXITY_API_KEY;

    await expect(importCli()).rejects.toBeInstanceOf(ExitError);
    expect(logSpy).toHaveBeenCalledWith(packageJson.version);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("prints the package version when -v is provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new ExitError(code);
    }) as never);

    process.argv = ["node", "index.ts", "-v"];
    delete process.env.PERPLEXITY_API_KEY;

    await expect(importCli()).rejects.toBeInstanceOf(ExitError);
    expect(logSpy).toHaveBeenCalledWith(packageJson.version);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("requires PERPLEXITY_API_KEY when no version flag is provided", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: number,
    ) => {
      throw new ExitError(code);
    }) as never);

    process.argv = ["node", "index.ts"];
    delete process.env.PERPLEXITY_API_KEY;

    await expect(importCli()).rejects.toBeInstanceOf(ExitError);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error: PERPLEXITY_API_KEY environment variable is required",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
