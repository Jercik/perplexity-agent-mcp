import { z } from "zod";
import { PerplexityResponse } from "./schemas.js";
import { stripThinkContent } from "./strip-think-content.js";

export function formatPerplexityResponse(json: unknown): string {
  const parsed = PerplexityResponse.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Unexpected response from Perplexity API:\n${z.prettifyError(parsed.error)}`, {
      cause: parsed.error,
    });
  }
  const { choices, search_results: searchResults } = parsed.data;

  // Reasoning models such as sonar-reasoning-pro emit <think> blocks that MCP clients should not see.
  const answer = stripThinkContent(choices[0].message.content).trim();
  if (answer === "") {
    throw new Error("Perplexity API returned an empty answer");
  }

  if (!searchResults || searchResults.length === 0) {
    return `${answer}\n`;
  }
  const sources = searchResults.map((result, index) => {
    const dateSuffix = result.date ? ` (${result.date})` : "";
    return `[${index + 1}] ${result.title} — ${result.url}${dateSuffix}`;
  });
  return `${answer}\n\nSources:\n${sources.join("\n")}\n`;
}
