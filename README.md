## Perplexity Agent MCP

Source: https://code.j4k.dev/j4k-oss/perplexity-agent-mcp. github.com/Jercik/perplexity-agent-mcp is a read-only mirror; open issues and pull requests on the Forge.

An opinionated, coding-specialized, Model Context Protocol server that integrates Perplexity AI's Sonar models into AI coding assistants like Claude Code or Codex CLI. It's deliberately lean and adds very few tokens to your context. It provides two specialized tools—`lookup` for instant fact-checking of API syntax and documentation details, and `answer` for comprehensive research with actionable recommendations.

### Setup

Install the published package globally:

```bash
npm install -g perplexity-agent-mcp
```

Each release is also published as `@j4k-oss/perplexity-agent-mcp` on the `code.j4k.dev` registry, for pnpm projects that exempt the `@j4k-oss` scope from `minimumReleaseAge`. To use that copy, map the scope to its registry and exempt it in `pnpm-workspace.yaml`, then add the package:

```yaml
registries:
  "@j4k-oss": https://code.j4k.dev/api/packages/j4k-oss/npm/
minimumReleaseAgeExclude:
  - "@j4k-oss/*"
```

```bash
pnpm add -D @j4k-oss/perplexity-agent-mcp
```

Both packages install the same `perplexity-agent-mcp` command and report the MCP server name `perplexity-agent-mcp`.

Then add it to your Claude config file (`~/.claude.json` or `~/.config/claude/config.json`):

```json
"mcpServers": {
  "perplexity": {
    "command": "perplexity-agent-mcp",
    "env": {
      "PERPLEXITY_API_KEY": "your-api-key-here"
    }
  }
}
```

Restart Claude Code after saving, and you're ready to go.

### How it works

The server exposes only two tools with concise descriptions (~1.3K tokens), keeping your context window lean and efficient:

- **lookup**: Gets quick facts from documentation (like API syntax or config keys)
- **answer**: Does deeper research to compare options and make recommendations

Under the hood, both tools are opinionated wrappers that call Perplexity API with coding-specialized system prompts. The lookup tool uses a compact fact‑extraction prompt focused on code/docs facts (see `LOOKUP_SYSTEM_PROMPT` in `src/prompts.ts`). The answer tool uses a technical decision/analysis prompt tailored for migrations and architecture choices (see `ANSWER_SYSTEM_PROMPT` in `src/prompts.ts`). Each tool calls a fixed Perplexity model chosen for its task, and callers cannot select another. The models are set in `registerLookupTool` (`src/tools/lookup.ts`) and `registerAnswerTool` (`src/tools/answer.ts`).

Example AI agent prompt that will trigger AI agent to use this MCP and give you good results:

```text
Please update the "foo" dependency to the latest version. Use Perplexity for the migration guide.
```

### Requirements

- Node.js v24.15.0 or newer
- A Perplexity API key

# Testing hooks
