import { type ChatOptions, PerplexityResponse } from "./schemas.js";
import { stripThinkContent } from "./strip-think-content.js";

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
  messages: Array<{ role: string; content: string }>,
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
    const message =
      jsonError instanceof Error ? jsonError.message : String(jsonError);
    throw new Error(
      `Failed to parse JSON response from Perplexity API: ${message}`,
      { cause: jsonError },
    );
  }

  const parsedResponse = PerplexityResponse.safeParse(json);

  let messageContent: string = parsedResponse.success
    ? (parsedResponse.data.choices?.[0]?.message?.content ?? "")
    : "";

  // Filter out <think> blocks from reasoning models (e.g., sonar-reasoning-pro)
  // These blocks contain internal reasoning tokens that should not be exposed to MCP clients
  messageContent = stripThinkContent(messageContent);

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
