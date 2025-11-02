import { z } from "zod";

/**
 * Schema for parsing a single Perplexity search result
 */
export const SearchResult = z.object({
  title: z.string(),
  url: z.string(),
  date: z.string().optional(),
  last_updated: z.string().optional(),
});

/**
 * Schema for parsing an array of Perplexity search results
 */
export const SearchResults = z.array(SearchResult);

/**
 * Minimal Perplexity response shape we rely on
 */
export const PerplexityResponse = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            content: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  search_results: SearchResults.optional(),
});

/**
 * Chat options for Perplexity API requests
 */
export type ChatOptions = {
  model: string;
  system: string;
  searchContextSize: "low" | "medium" | "high";
};
