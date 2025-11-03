import { describe, it, expect } from "vitest";
import { stripThinkContent } from "./strip-think-content.ts";

describe("stripThinkContent", () => {
  describe("basic functionality", () => {
    it("should remove simple think blocks", () => {
      const input = "Before <think>reasoning content</think> After";
      const expected = "Before  After";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });

    it("should remove multiline think blocks", () => {
      const input = `Before
<think>
  multi
  line
  reasoning
</think>
After`;
      const expected = "Before\n\nAfter";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });

    it("should remove multiple separate think blocks", () => {
      const input =
        "Start <think>first</think> middle <think>second</think> end";
      const expected = "Start  end";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });
  });

  describe("nested and multiple think blocks behavior", () => {
    it("should remove nested think blocks completely", () => {
      const input = `Before content
<think>
  Outer reasoning
  <think>
    Inner reasoning
  </think>
  More outer reasoning
</think>
After content`;

      const expected = "Before content\n\nAfter content";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });

    it("should handle multiple nested levels", () => {
      const input = `Start
<think>
  Level 1
  <think>
    Level 2
    <think>
      Level 3
    </think>
    Back to level 2
  </think>
  Back to level 1
</think>
End`;

      const expected = "Start\n\nEnd";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });

    it("should handle mixed nested and separate think blocks", () => {
      // Intentional behavior when combining nested blocks with separate blocks.
      // Example: "A <think>1</think> B <think>2</think> C" => "A C".
      const input = `First <think>simple block</think> middle
<think>
  Outer block
  <think>
    Inner block
  </think>
  More outer
</think>
Last <think>another simple</think> end`;

      const expected = "First  end";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });

    it("should handle adjacent nested blocks", () => {
      const input = `<think>
  First outer
  <think>
    First inner
  </think>
</think><think>
  Second outer
  <think>
    Second inner
  </think>
</think>`;

      const expected = "";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });
  });

  describe("unbalanced think tags", () => {
    it("should handle unbalanced nested tags - extra opening tag", () => {
      const input = "<think>foo<think></think>";
      const expected = "";
      const result = stripThinkContent(input);

      expect(result).toBe(expected);
    });

    it("should handle unbalanced nested tags - extra closing tag", () => {
      const input = "Start <think></think>foo</think> End";
      const expected = "Start  End";
      const result = stripThinkContent(input);

      expect(result).toBe(expected);
    });

    it("should handle text around unbalanced tags", () => {
      const input = "Before <think>foo<think></think> After";
      const expected = "Before  After";
      const result = stripThinkContent(input);
      expect(result).toBe(expected);
    });

    it("should handle completely unmatched opening tag", () => {
      const input = "Before <think>unclosed content After";
      const expected = "Before <think>unclosed content After";
      const result = stripThinkContent(input);

      expect(result).toBe(expected);
    });

    it("should handle completely unmatched closing tag", () => {
      const input = "Before unopened content</think> After";
      const expected = "Before unopened content</think> After";
      const result = stripThinkContent(input);

      expect(result).toBe(expected);
    });
  });
});
