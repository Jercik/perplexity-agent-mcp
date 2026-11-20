import { formatPerplexityResponse } from "./format-perplexity-response.js";
import type { ChatOptions } from "./schemas.js";

/**
 * Performs a chat completion by sending a request to the Perplexity API.
 * Filters out <think> blocks from reasoning models before returning content.
 *
 * @param {Array<{ role: string; content: string }>} messages - An array of message objects.
 * @param {ChatOptions} options - Options for the chat completion.
 * @returns {Promise<string>} The chat completion result content.
 * @throws Will throw an error if the API request fails.
 */
export async function performChatCompletion(
  messages: { role: string; content: string }[],
  options: ChatOptions,
): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PERPLEXITY_API_KEY is not set. Please export it before calling performChatCompletion().",
    );
  }
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
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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
