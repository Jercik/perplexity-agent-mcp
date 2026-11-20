import { z } from "zod";
import { LOOKUP_SYSTEM_PROMPT } from "../prompts.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AskPerplexity } from "../ask-perplexity.js";

/**
 * Registers the lookup tool with the MCP server.
 * Fetches precise, source-backed facts from official sources.
 */
export function registerLookupTool(server: McpServer, askPerplexity: AskPerplexity) {
  server.registerTool(
    "lookup",
    {
      description: `
Fetches precise, source-backed facts from official sources.
Use for API syntax/params, config keys/defaults, CLI flags, runtime compatibility, and package metadata (types, ESM/CJS, side-effects).
Returns short, factual answers. No recommendations or comparisons.
Examples: "What's the default timeout for fetch()?", "What parameters does useState accept?", "Show me how Zod validates email addresses"
One question per call—split combined requests into separate queries.
`.trim(),
      inputSchema: {
        query: z.string().describe("The documentation query to look up"),
      },
    },
    async ({ query }, { signal }) => {
      const result = await askPerplexity(query, {
        model: "sonar-pro",
        system: LOOKUP_SYSTEM_PROMPT,
        searchContextSize: "medium",
        signal,
      });
      return { content: [{ type: "text", text: result }] };
    },
  );
}
