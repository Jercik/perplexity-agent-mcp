## Perplexity Agent MCP

An opinionated Model Context Protocol server that seamlessly integrates Perplexity AI's Sonar models into AI coding assistants like Claude Code. It provides two specialized, purpose-built tools—`lookup` for instant fact-checking of API syntax and documentation details, and `answer` for comprehensive research with actionable recommendations—delivering clean, focused responses without internal reasoning.

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

The server exposes only two tools with concise descriptions (~1.3K tokens), keeping your context window lean and efficient:

- **lookup**: Gets quick facts from documentation (like API syntax or config keys)
- **answer**: Does deeper research to compare options and make recommendations

Both tools return clean, focused answers without any internal reasoning clutter. The server picks the right AI model for each job—fast for lookups, thorough for research. The minimal token footprint ensures your AI assistant has maximum context available for your actual code and conversations.

### Requirements

- Node.js v24 or newer
- A Perplexity API key
