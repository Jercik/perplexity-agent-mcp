import { describe, expect, it } from "vitest";
import { formatPerplexityResponse } from "./format-perplexity-response.ts";

describe("formatPerplexityResponse", () => {
  it("lists sources after the answer, dating those that carry a date", () => {
    const response = {
      choices: [{ message: { content: "<think>plan</think>\nUse fetch().\n" } }],
      search_results: [
        { title: "MDN", url: "https://example.com/fetch", date: "2026-01-02" },
        { title: "Spec", url: "https://example.com/spec", date: null, last_updated: null },
      ],
    };

    expect(formatPerplexityResponse(response)).toBe(
      "Use fetch().\n\nSources:\n[1] MDN — https://example.com/fetch (2026-01-02)\n[2] Spec — https://example.com/spec\n",
    );
  });

  it.each([
    ["absent", { choices: [{ message: { content: "Use fetch()." } }] }],
    ["null", { choices: [{ message: { content: "Use fetch()." } }], search_results: null }],
    ["empty", { choices: [{ message: { content: "Use fetch()." } }], search_results: [] }],
  ])("returns only the answer when search results are %s", (_, response) => {
    expect(formatPerplexityResponse(response)).toBe("Use fetch().\n");
  });

  it.each([
    [
      "no choices",
      { choices: [] },
      "Unexpected response from Perplexity API:\n✖ Invalid input: expected object, received undefined\n  → at choices[0]",
    ],
    [
      "null content",
      { choices: [{ message: { content: null } }] },
      "Unexpected response from Perplexity API:\n✖ Invalid input: expected string, received null\n  → at choices[0].message.content",
    ],
    [
      "only reasoning",
      { choices: [{ message: { content: "<think>plan</think>" } }] },
      "Perplexity API returned an empty answer",
    ],
  ])("rejects a response with %s", (_, response, message) => {
    expect(() => formatPerplexityResponse(response)).toThrow(new Error(message));
  });
});
