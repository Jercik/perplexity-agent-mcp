#!/usr/bin/env node

import { runServer } from "./server.js";

/**
 * Main entry point for the Perplexity MCP Server
 */

// Validate required environment variables
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is required");
  process.exit(1);
}

try {
  await runServer();
} catch (error) {
  console.error("Fatal error running server:", error);
  process.exit(1);
}
