import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import packageJson from "../package.json" with { type: "json" };
import { registerLookupTool } from "./tools/lookup.js";
import { registerAnswerTool } from "./tools/answer.js";

/**
 * Creates and configures the MCP server with all tools
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: packageJson.name,
    version: packageJson.version,
  });

  // Register all tools
  registerLookupTool(server);
  registerAnswerTool(server);

  return server;
}

/**
 * Starts the MCP server with stdio transport
 */
export async function runServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "Perplexity MCP Server running on stdio with Lookup and Answer tools",
  );
}
