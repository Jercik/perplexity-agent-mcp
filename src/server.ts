import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import packageJson from "../package.json" with { type: "json" };
import { registerTools } from "./register-tools.js";
import type { AskPerplexity } from "./ask-perplexity.js";

/**
 * Creates and configures the MCP server with all tools
 */
export function createServer(askPerplexity: AskPerplexity): McpServer {
  const server = new McpServer({
    // Pinned: the scoped Forge package name must not change the name MCP clients see.
    name: "perplexity-agent-mcp",
    version: packageJson.version,
  });

  registerTools(server, askPerplexity);

  return server;
}

/**
 * Starts the MCP server with stdio transport
 */
export async function runServer(askPerplexity: AskPerplexity): Promise<void> {
  const server = createServer(askPerplexity);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Perplexity MCP Server running on stdio");
}
