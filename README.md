## Perplexity Agent MCP

An MCP server that gives your coding assistant access to Perplexity AI through two tools: `lookup` for quick fact-checking and `answer` for in-depth research with recommendations.

### Setup

First, install and link the server:

```bash
npm install
npm link
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

The server provides two tools:

- **lookup**: Gets quick facts from documentation (like API syntax or config keys)
- **answer**: Does deeper research to compare options and make recommendations

Both tools return clean, focused answers without any internal reasoning clutter. The server picks the right AI model for each job—fast for lookups, thorough for research.

### Requirements

- Node.js v24 or newer
- A Perplexity API key
