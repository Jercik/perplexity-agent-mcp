import { z } from "zod";
import { askPerplexity } from "../ask-perplexity.js";
import { ANSWER_SYSTEM_PROMPT } from "../prompts.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the answer tool with the MCP server.
 * Researches questions and provides recommendations backed by sources.
 */
export function registerAnswerTool(server: McpServer, apiKey: string) {
  server.registerTool(
    "answer",
    {
      description: `
Researches a question, compares options, and recommends a path (backed by sources).
Use for library choices, architecture trade-offs, migrations, complex debugging, and performance decisions.
Returns a concise recommendation, a brief why, and short how-to steps.
Examples: "Should I use Zod or Valibot?", "How to optimize React bundle size?", "Best auth approach for Node.js microservices?"
One question per call—split combined requests into separate queries.
`.trim(),
      inputSchema: {
        question: z.string().describe("The decision or problem to answer"),
      },
    },
    async ({ question }, { signal }) => {
      const result = await askPerplexity(question, {
        apiKey,
        model: "sonar-reasoning-pro",
        system: ANSWER_SYSTEM_PROMPT,
        searchContextSize: "high",
        signal,
      });
      return { content: [{ type: "text", text: result }] };
    },
  );
}
