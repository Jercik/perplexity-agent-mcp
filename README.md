## Perplexity Agent MCP

An opinionated, coding‑specialized, Model Context Protocol server that integrates Perplexity AI's Sonar models into AI coding assistants like Claude Code or Codex CLI. It's deliberately lean and adds very few tokens to your context. It provides two specialized tools—`lookup` for instant fact-checking of API syntax and documentation details, and `answer` for comprehensive research with actionable recommendations.

### Setup

Install the published package globally:

```bash
npm install -g perplexity-agent-mcp
```

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

Under the hood, both tools are opinionated wrappers that call Perplexity API with coding‑specialized system prompts. The lookup tool uses a compact fact‑extraction prompt focused on code/docs facts (see `src/index.ts:67`–`src/index.ts:90`). The answer tool uses a technical decision/analysis prompt tailored for migrations and architecture choices (see `src/index.ts:92`–`src/index.ts:121`). The server also selects task‑appropriate Perplexity models—`sonar-pro` for lookups (see `src/index.ts:249`) and `sonar-reasoning-pro` for deeper research (see `src/index.ts:276`).

Example AI agent prompt that will trigger AI agent to use this MCP and give you good results:

```text
Please update the "foo" dependency to the latest version. Use Perplexity for the migration guide.
```

### Requirements

- Node.js v22.14.0 or newer
- A Perplexity API key
