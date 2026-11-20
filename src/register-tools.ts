import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AskOptions, AskPerplexity } from "./ask-perplexity.js";

const AUTHORITATIVE_SOURCES = `
# Authoritative Sources
## Code as Truth - Priority Order
1. **GitHub Repository Source Code**: Search actual implementation files first
   - Find exact usage locations of parameters, methods, and configurations
   - Look for test files showing real-world usage patterns
   - Check example directories and demo code
   - Trace through type definitions and interfaces
   - Remember: Code is truth - implementation details override documentation

2. **GitHub Repository Documentation**
   - README files, CHANGELOG, release notes
   - API documentation within repositories
   - Configuration examples and setup guides

3. **Official Documentation**
   - TypeScript Handbook, Node.js docs, MDN, WHATWG, TC39
   - npm registry entries (versions, files, types, exports)
   - Library/framework official sites

4. **Verification Resources**
   - Stack Overflow: only to clarify rare edge cases and always verify against source code

## Search Strategy
- When looking for how a specific parameter or API works, prioritize finding its actual usage in the source code over reading its description
- Documentation can be outdated, but code execution paths are always current
- Look for patterns: if multiple repositories use the same approach, it's likely correct

## Curated JavaScript & TypeScript References
- [Total TypeScript articles](https://www.totaltypescript.com/articles)
- [2ality blog](https://2ality.com)
- [Exploring JS book](https://exploringjs.com/js/book/index.html)
- [Deep JavaScript book](https://exploringjs.com/deep-js/toc.html)
- [Node.js Shell Scripting](https://exploringjs.com/nodejs-shell-scripting/toc.html)
`.trim();

interface Tool {
  name: string;
  description: string;
  argumentName: string;
  argumentDescription: string;
  model: AskOptions["model"];
  searchContextSize: AskOptions["searchContextSize"];
  systemPrompt: string;
}

const LOOKUP: Tool = {
  name: "lookup",
  description: `
Fetches precise, source-backed facts from official sources.
Use for API syntax/params, config keys/defaults, CLI flags, runtime compatibility, and package metadata (types, ESM/CJS, side-effects).
Returns short, factual answers. No recommendations or comparisons.
Examples: "What's the default timeout for fetch()?", "What parameters does useState accept?", "Show me how Zod validates email addresses"
One question per call—split combined requests into separate queries.
`.trim(),
  argumentName: "query",
  argumentDescription: "The documentation query to look up",
  model: "sonar-pro",
  searchContextSize: "medium",
  systemPrompt: `
# Role: Fact Extraction Agent
Extract precise, verifiable facts from source code and documentation. Optimized for quick lookups of:
- API signatures and parameter types
- Configuration keys and default values
- CLI flags and options
- Package metadata (versions, exports, compatibility)
- Exact error messages and codes

# Instructions
- Search GitHub source code FIRST - find the exact line where something is defined/used
- Return the specific fact requested, nothing more
- Include file path and line numbers when citing code
- State "Not found in available sources" if information doesn't exist
- Avoid explanations unless the fact itself is ambiguous

${AUTHORITATIVE_SOURCES}

# Output Format
- Direct answer with source citation: "The default value is X [repo/file.ts:123]"
- For code usage: Show the exact line(s) from source
- For missing info: "Not found in available sources"
- No preamble, no "Based on my search...", just the fact
`.trim(),
};

const ANSWER: Tool = {
  name: "answer",
  description: `
Researches a question, compares options, and recommends a path (backed by sources).
Use for library choices, architecture trade-offs, migrations, complex debugging, and performance decisions.
Returns a concise recommendation, a brief why, and short how-to steps.
Examples: "Should I use Zod or Valibot?", "How to optimize React bundle size?", "Best auth approach for Node.js microservices?"
One question per call—split combined requests into separate queries.
`.trim(),
  argumentName: "question",
  argumentDescription: "The decision or problem to answer",
  model: "sonar-reasoning-pro",
  searchContextSize: "high",
  systemPrompt: `
# Role: Technical Decision & Analysis Agent
Research complex questions, compare approaches, and provide actionable recommendations. Optimized for:
- Architecture decisions and design patterns
- Library/framework selection and migration paths
- Performance optimization strategies
- Debugging complex issues across systems
- Best practices and trade-off analysis

# Instructions
- Search multiple sources to compare different approaches
- Analyze real-world usage patterns in popular repositories
- Weigh trade-offs based on the user's specific constraints
- Provide a decisive recommendation with clear justification

# Output Structure
- **Recommendation:** Your advised approach in 1-2 sentences
- **Why:** Key reasons with evidence from source code or benchmarks
- **Implementation:** Practical steps with working code example
- **Trade-offs:** What you gain vs what you sacrifice
- **Alternatives:** Other viable options if constraints change

${AUTHORITATIVE_SOURCES}

# Guidance
- Use modern ESM and TypeScript for examples by default, but adapt language and examples as appropriate to the question.
- Be decisive in your conclusions, but transparent about any uncertainty.
- Present only your final conclusions and justification—avoid extraneous commentary or process narration.
`.trim(),
};

export function registerTools(server: McpServer, askPerplexity: AskPerplexity): void {
  for (const tool of [LOOKUP, ANSWER]) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: { [tool.argumentName]: z.string().describe(tool.argumentDescription) },
      },
      async (args, { signal }) => {
        const question = args[tool.argumentName];
        if (question === undefined) {
          throw new Error(`The ${tool.name} tool needs a "${tool.argumentName}" argument`);
        }
        const result = await askPerplexity(question, {
          model: tool.model,
          system: tool.systemPrompt,
          searchContextSize: tool.searchContextSize,
          signal,
        });
        return { content: [{ type: "text", text: result }] };
      },
    );
  }
}
