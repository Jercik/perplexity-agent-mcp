#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { filterThinkBlocks } from "./filter-think-blocks.ts";

// Zod schema for parsing Perplexity search_results
const SearchResult = z.object({
  title: z.string(),
  url: z.string(),
  date: z.string().optional(),
  last_updated: z.string().optional(),
});
const SearchResults = z.array(SearchResult);

const AUTHORITATIVE_SOURCES = `
AUTHORITATIVE SOURCES TO CHECK (use when relevant)

- Prefer official docs and primary sources:
  • GitHub repositories (README, CHANGELOG, release notes, source)
  • Official docs and standards (TypeScript Handbook, Node.js docs, MDN, WHATWG, TC39)
  • npm registry pages (versions, files, types, exports)
  • Stack Overflow only to clarify edge cases; verify against primary sources

- Curated JavaScript & TypeScript references:
  • Total TypeScript articles: https://www.totaltypescript.com/articles
  • 2ality blog: https://2ality.com
  • Exploring JS book: https://exploringjs.com/js/book/index.html
  • Deep JavaScript book: https://exploringjs.com/deep-js/toc.html
  • Node.js Shell Scripting: https://exploringjs.com/nodejs-shell-scripting/toc.html

Default examples to modern ESM and TypeScript when relevant.
`.trim();

/**
 * Prompt structure and visibility
 *
 * - Tool descriptions (below) are visible to the MCP client (for example,
 *   Claude Code) and become part of the client's prompt. Keep them short and
 *   clear.
 * - System prompts (LOOKUP_SYSTEM_PROMPT and ANSWER_SYSTEM_PROMPT) are sent
 *   only to Perplexity via its Chat Completions API. They guide the model
 *   invoked by this server and are not visible to the MCP client. These can be
 *   longer and more detailed because they do not consume the client's context window.
 */
const LOOKUP_SYSTEM_PROMPT = `
You are a documentation lookup agent.
Extract exact, source-backed facts from authoritative sources.
Do not recommend, compare, or speculate.
Prefer the most recent stable docs and note visible versions or dates.
If something is unclear or undocumented, say so plainly.
Keep answers concise and factual, optionally with a minimal copy-paste example.
Avoid chain-of-thought; output only final facts.

${AUTHORITATIVE_SOURCES}
`.trim();

const ANSWER_SYSTEM_PROMPT = `
You are a technical research and decision agent.
Gather evidence from authoritative sources, compare options, and make a clear recommendation.
State assumptions, highlight trade-offs, and explain why your choice fits the stated constraints (runtime, framework, TypeScript/ESM needs, performance, maintenance).
Provide a concise "Recommendation", a brief "Why", pragmatic "How to implement" steps with a TypeScript-first snippet, and "Alternatives" when appropriate.
Be decisive but honest about uncertainty.
Present conclusions and justification only.
Always ground claims in citations.

Anchor your research in official docs, GitHub repos, npm, MDN, and standards.
Use high-quality community sources for corroboration.
${AUTHORITATIVE_SOURCES}
`.trim();

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is required");
  process.exit(1);
}

type ChatOpts = {
  model: string;
  system: string;
  searchContextSize: "low" | "medium" | "high";
};

/**
 * Performs a chat completion by sending a request to the Perplexity API.
 * Filters out <think> blocks from reasoning models before returning content.
 *
 * @param {Array<{ role: string; content: string }>} messages - An array of message objects.
 * @param {ChatOpts} opts - Options for the chat completion.
 * @returns {Promise<string>} The chat completion result content.
 * @throws Will throw an error if the API request fails.
 */
async function performChatCompletion(
  messages: Array<{ role: string; content: string }>,
  opts: ChatOpts
): Promise<string> {
  const url = new URL("https://api.perplexity.ai/chat/completions");
  const body = {
    model: opts.model,
    messages: [{ role: "system", content: opts.system }, ...messages],
    web_search_options: { search_context_size: opts.searchContextSize },
  };

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Network error while calling Perplexity API: ${error}`);
  }

  if (!response.ok) {
    let errorText;
    try {
      errorText = await response.text();
    } catch (parseError) {
      errorText = "Unable to parse error response";
    }
    throw new Error(
      `Perplexity API error: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  let data: any;
  try {
    data = await response.json();
  } catch (jsonError) {
    throw new Error(
      `Failed to parse JSON response from Perplexity API: ${jsonError}`
    );
  }

  let messageContent = data.choices?.[0]?.message?.content ?? "";

  // Filter out <think> blocks from reasoning models (e.g., sonar-reasoning-pro)
  // These blocks contain internal reasoning tokens that should not be exposed to MCP clients
  messageContent = filterThinkBlocks(messageContent);

  // Build final content and normalize whitespace consistently

  // Append Sources section by rendering all search_results in order.
  try {
    const parsed = SearchResults.safeParse(data.search_results);
    if (
      parsed.success &&
      parsed.data.length > 0 &&
      typeof messageContent === "string"
    ) {
      const lines = parsed.data.map((sr, i) => {
        const idx = i + 1;
        const dateSuffix = sr.date ? ` (${sr.date})` : "";
        return `[${idx}] ${sr.title} — ${sr.url}${dateSuffix}`;
      });
      messageContent = `${messageContent}\n\nSources:\n${lines.join("\n")}`;
    }
  } catch (_) {
    // If anything goes wrong while appending sources, fall back to content only.
  }

  // Trim leading and trailing whitespace, then ensure one trailing newline
  messageContent = String(messageContent).trim();

  // Ensure trailing newline in final response
  messageContent += "\n";

  return messageContent;
}

const server = new McpServer({
  name: packageJson.name,
  version: packageJson.version,
});

// lookup tool
server.registerTool(
  "lookup",
  {
    description: `
Fetch precise, source-backed facts from official sources.
Use for API syntax/params, config keys/defaults, CLI flags, runtime compatibility, and package metadata (types, ESM/CJS, side-effects).
Returns short, factual answers. No recommendations or comparisons.
`.trim(),
    inputSchema: {
      query: z.string().describe("What fact to look up from docs"),
    },
  },
  async ({ query }) => {
    const result = await performChatCompletion(
      [{ role: "user", content: query }],
      {
        model: "sonar-pro",
        system: LOOKUP_SYSTEM_PROMPT,
        searchContextSize: "medium",
      }
    );
    return { content: [{ type: "text", text: result }] };
  }
);

// answer tool
server.registerTool(
  "answer",
  {
    description: `
Research a question, compare options, and recommend a path (backed by sources).
Use for library choices, architecture trade-offs, migrations, complex debugging, and performance decisions.
Returns a concise recommendation, a brief why, and short how-to steps.
`.trim(),
    inputSchema: {
      question: z.string().describe("The decision or problem to answer"),
    },
  },
  async ({ question }) => {
    const result = await performChatCompletion(
      [{ role: "user", content: question }],
      {
        model: "sonar-reasoning-pro",
        system: ANSWER_SYSTEM_PROMPT,
        searchContextSize: "high",
      }
    );
    return { content: [{ type: "text", text: result }] };
  }
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "Perplexity MCP Server running on stdio with Lookup and Answer tools"
  );
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
