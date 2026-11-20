import { describe, it, expect } from "vitest";
import { stripThinkContent } from "./strip-think-content.ts";

describe("stripThinkContent", () => {
  it("removes the reasoning block that opens the content", () => {
    const input = "<think>reasoning content</think>\nAnswer";
    expect(stripThinkContent(input)).toBe("\nAnswer");
  });

  it("removes a multiline reasoning block after leading whitespace", () => {
    const input = `
<think>
  multi
  line
  reasoning
</think>
Answer`;
    expect(stripThinkContent(input)).toBe("\nAnswer");
  });

  it("keeps an answer that names the tags when no reasoning block opens it", () => {
    const input = "R1 wraps its reasoning in `<think>` and `</think>` tags.";
    expect(stripThinkContent(input)).toBe(
      "R1 wraps its reasoning in `<think>` and `</think>` tags.",
    );
  });

  it("ends the reasoning block at its first closing tag, keeping later tags in the answer", () => {
    const input = '<think>plan</think>\nUse `text.split("</think>")[1]`.';
    expect(stripThinkContent(input)).toBe('\nUse `text.split("</think>")[1]`.');
  });

  it("keeps content whose opening reasoning block never closes", () => {
    const input = "<think>unclosed content After";
    expect(stripThinkContent(input)).toBe("<think>unclosed content After");
  });
});
