#!/usr/bin/env node

import { parseArgs } from "node:util";
import packageJson from "../package.json" with { type: "json" };
import { runServer } from "./server.js";

/**
 * Main entry point for the Perplexity MCP Server
 */

function parseCommandLine(): { version: boolean } {
  try {
    const { values } = parseArgs({ options: { version: { type: "boolean", short: "v" } } });
    return { version: values.version === true };
  } catch (error) {
    console.error(
      `Error: ${(error as Error).message}\nUsage: perplexity-agent-mcp [-v | --version]`,
    );
    return process.exit(2);
  }
}

if (parseCommandLine().version) {
  console.log(packageJson.version);
  process.exit(0);
}

function readApiKey(): string {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("Error: PERPLEXITY_API_KEY environment variable is required");
    return process.exit(1);
  }
  return apiKey;
}

const apiKey = readApiKey();

async function main(): Promise<void> {
  try {
    await runServer(apiKey);
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

// Called from a plain function: the repo's lint config forbids both a
// top-level await and a top-level call to an async function.
function start(): void {
  void main();
}

start();
