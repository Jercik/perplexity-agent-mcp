import { z } from "zod";

export const SearchResult = z.object({
  title: z.string(),
  url: z.string(),
  date: z.string().optional(),
  last_updated: z.string().optional(),
});

export const SearchResults = z.array(SearchResult);

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
