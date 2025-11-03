/**
 * Removes <think> blocks from the response content.
 * The sonar-reasoning-pro model outputs reasoning tokens in <think> blocks
 * that should be filtered out before returning to the client.
 *
 * Intentional behavior: We remove everything from the first "<think>" to the
 * last "</think>", treating any nested or stray think tags as a single block.
 * For example, the input "A <think>1</think> B <think>2</think> C" becomes
 * "A C" (note that " B " is removed). This is by design: there should only be
 * one reasoning block, and any accidental inner think tags must not interfere
 * with the primary goal of stripping the reasoning block entirely.
 *
 * @param {string} input - The raw content from the API response
 * @returns {string} The content with <think> blocks removed
 */
export function stripThinkContent(input: string): string {
  const open = "<think>";
  const close = "</think>";

  const firstOpen = input.indexOf(open);
  if (firstOpen === -1) return input;

  const lastClose = input.lastIndexOf(close);
  if (lastClose === -1 || lastClose < firstOpen) return input;

  const end = lastClose + close.length;
  return input.slice(0, firstOpen) + input.slice(end);
}
