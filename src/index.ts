#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import packageJson from "../package.json" with { type: "json" };
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { filterThinkBlocks } from "./filter-think-blocks.js";
import { PerplexityResponse } from "./schemas/perplexity-response.js";

const AUTHORITATIVE_SOURCES = `
# Authoritative Sources
## Code as Truth - Priority Order
1. **GitHub Repository Source Code**: Search actual implementation files first
   - Find exact usage locations of parameters, methods, and configurations
   - Look for test files showing real-world usage patterns
   - Check example directories and demo code
   - Trace through type definitions and interfaces
   - Remember: Code is truth - implementation details override documentation

2. **GitHub Repository Documentation**
   - README files, CHANGELOG, release notes
   - API documentation within repositories
   - Configuration examples and setup guides

3. **Official Documentation**
   - TypeScript Handbook, Node.js docs, MDN, WHATWG, TC39
   - npm registry entries (versions, files, types, exports)
   - Library/framework official sites

4. **Verification Resources**
   - Stack Overflow: only to clarify rare edge cases and always verify against source code

## Search Strategy
- When looking for how a specific parameter or API works, prioritize finding its actual usage in the source code over reading its description
- Documentation can be outdated, but code execution paths are always current
- Look for patterns: if multiple repositories use the same approach, it's likely correct

## Curated JavaScript & TypeScript References
- [Total TypeScript articles](https://www.totaltypescript.com/articles)
- [2ality blog](https://2ality.com)
- [Exploring JS book](https://exploringjs.com/js/book/index.html)
- [Deep JavaScript book](https://exploringjs.com/deep-js/toc.html)
- [Node.js Shell Scripting](https://exploringjs.com/nodejs-shell-scripting/toc.html)

- Default to using modern ESM and TypeScript for examples when relevant.
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
# Role: Fact Extraction Agent
Extract precise, verifiable facts from source code and documentation. Optimized for quick lookups of:
- API signatures and parameter types
- Configuration keys and default values
- CLI flags and options
- Package metadata (versions, exports, compatibility)
- Exact error messages and codes

# Instructions
- Search GitHub source code FIRST - find the exact line where something is defined/used
- Return the specific fact requested, nothing more
- Include file path and line numbers when citing code
- State "Not found in available sources" if information doesn't exist
- Avoid explanations unless the fact itself is ambiguous

${AUTHORITATIVE_SOURCES}

# Output Format
- Direct answer with source citation: "The default value is X [repo/file.ts:123]"
- For code usage: Show the exact line(s) from source
- For missing info: "Not found in available sources"
- No preamble, no "Based on my search...", just the fact
`.trim();

const ANSWER_SYSTEM_PROMPT = `
# Role: Technical Decision & Analysis Agent
Research complex questions, compare approaches, and provide actionable recommendations. Optimized for:
- Architecture decisions and design patterns
- Library/framework selection and migration paths
- Performance optimization strategies
- Debugging complex issues across systems
- Best practices and trade-off analysis

# Instructions
- Start with a brief analysis plan (3-5 conceptual steps) to structure your research
- Search multiple sources to compare different approaches
- Analyze real-world usage patterns in popular repositories
- Weigh trade-offs based on the user's specific constraints
- Provide a decisive recommendation with clear justification

# Output Structure
- **Recommendation:** Your advised approach in 1-2 sentences
- **Why:** Key reasons with evidence from source code or benchmarks
- **Implementation:** Practical steps with working code example
- **Trade-offs:** What you gain vs what you sacrifice
- **Alternatives:** Other viable options if constraints change

${AUTHORITATIVE_SOURCES}

# Guidance
- Use modern ESM and TypeScript for examples by default, but adapt language and examples as appropriate to the question.
- Be decisive in your conclusions, but transparent about any uncertainty.
- Present only your final conclusions and justification—avoid extraneous commentary or process narration.
`.trim();

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
if (!PERPLEXITY_API_KEY) {
  console.error("Error: PERPLEXITY_API_KEY environment variable is required");
  process.exit(1);
}

type ChatOptions = {
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
  options: ChatOptions,
): Promise<string> {
  const url = new URL("https://api.perplexity.ai/chat/completions");
  const body = {
    model: options.model,
    messages: [{ role: "system", content: options.system }, ...messages],
    web_search_options: { search_context_size: options.searchContextSize },
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
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error while calling Perplexity API: ${message}`);
  }

  if (!response.ok) {
    let errorText;
    try {
      errorText = await response.text();
    } catch {
      errorText = "Unable to parse error response";
    }
    throw new Error(
      `Perplexity API error: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (jsonError) {
    const message =
      jsonError instanceof Error ? jsonError.message : String(jsonError);
    throw new Error(
      `Failed to parse JSON response from Perplexity API: ${message}`,
    );
  }

  const parsedResponse = PerplexityResponse.safeParse(json);

  let messageContent: string = parsedResponse.success
    ? (parsedResponse.data.choices?.[0]?.message?.content ?? "")
    : "";

  // Filter out <think> blocks from reasoning models (e.g., sonar-reasoning-pro)
  // These blocks contain internal reasoning tokens that should not be exposed to MCP clients
  messageContent = filterThinkBlocks(messageContent);

  // Build final content and normalize whitespace consistently

  // Append Sources section by rendering all search_results in order.
  if (parsedResponse.success && parsedResponse.data.search_results) {
    const results = parsedResponse.data.search_results;
    if (results.length > 0) {
      const lines = results.map((sr, index) => {
        const index_ = index + 1;
        const dateSuffix = sr.date ? ` (${sr.date})` : "";
        return `[${index_}] ${sr.title} — ${sr.url}${dateSuffix}`;
      });
      messageContent = `${messageContent}\n\nSources:\n${lines.join("\n")}`;
    }
  }

  // Trim leading and trailing whitespace, then ensure one trailing newline
  messageContent = messageContent.trim();

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
Fetches precise, source-backed facts from official sources.
Use for API syntax/params, config keys/defaults, CLI flags, runtime compatibility, and package metadata (types, ESM/CJS, side-effects).
Returns short, factual answers. No recommendations or comparisons.
Examples: "What's the default timeout for fetch()?", "What parameters does useState accept?", "Show me how Zod validates email addresses"
`.trim(),
    inputSchema: {
      query: z.string().describe("The documentation query to look up"),
    },
  },
  async ({ query }) => {
    const result = await performChatCompletion(
      [{ role: "user", content: query }],
      {
        model: "sonar-pro",
        system: LOOKUP_SYSTEM_PROMPT,
        searchContextSize: "medium",
      },
    );
    return { content: [{ type: "text", text: result }] };
  },
);

// answer tool
server.registerTool(
  "answer",
  {
    description: `
Researches a question, compares options, and recommends a path (backed by sources).
Use for library choices, architecture trade-offs, migrations, complex debugging, and performance decisions.
Returns a concise recommendation, a brief why, and short how-to steps.
Examples: "Should I use Zod or Valibot?", "How to optimize React bundle size?", "Best auth approach for Node.js microservices?"
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
      },
    );
    return { content: [{ type: "text", text: result }] };
  },
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "Perplexity MCP Server running on stdio with Lookup and Answer tools",
  );
}

try {
  await runServer();
} catch (error) {
  console.error("Fatal error running server:", error);
  process.exit(1);
}
