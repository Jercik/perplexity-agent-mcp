import { z } from "zod";

/**
 * Schema for parsing a single Perplexity search result
 */
const SearchResult = z.object({
  title: z.string(),
  url: z.string(),
  date: z.string().nullish(),
});

const Choice = z.object({
  message: z.object({
    content: z.string(),
  }),
});

/**
 * Minimal Perplexity response shape we rely on
 */
export const PerplexityResponse = z.object({
  choices: z.tuple([Choice], Choice),
  search_results: z.array(SearchResult).nullish(),
});

/**
 * Chat options for Perplexity API requests
 */
export interface ChatOptions {
  model: string;
  system: string;
  searchContextSize: "low" | "medium" | "high";
}
