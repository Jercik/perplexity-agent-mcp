// Reasoning models open their output with the reasoning block; any later tags belong to the answer.
const leadingReasoningBlock = /^\s*<think>[\s\S]*?<\/think>/u;

export function stripThinkContent(input: string): string {
  return input.replace(leadingReasoningBlock, "");
}
