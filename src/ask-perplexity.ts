import { formatPerplexityResponse } from "./format-perplexity-response.js";

interface AskOptions {
  apiKey: string;
  model: string;
  system: string;
  searchContextSize: "low" | "medium" | "high";
  signal: AbortSignal;
}

export async function askPerplexity(
  question: string,
  { apiKey, model, system, searchContextSize, signal }: AskOptions,
): Promise<string> {
  const url = new URL("https://api.perplexity.ai/chat/completions");
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: question },
    ],
    web_search_options: { search_context_size: searchContextSize },
  };

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error while calling Perplexity API: ${message}`, {
      cause: error,
    });
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
    const message = jsonError instanceof Error ? jsonError.message : String(jsonError);
    throw new Error(`Failed to parse JSON response from Perplexity API: ${message}`, {
      cause: jsonError,
    });
  }

  return formatPerplexityResponse(json);
}
