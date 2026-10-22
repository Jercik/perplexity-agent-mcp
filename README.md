## Perplexity Agent MCP

Source: https://code.j4k.dev/j4k-oss/perplexity-agent-mcp. github.com/Jercik/perplexity-agent-mcp is a read-only mirror; open issues and pull requests on the Forge.

An opinionated, coding-specialized, Model Context Protocol server that integrates Perplexity AI's Sonar models into AI coding assistants like Claude Code or Codex CLI. It's deliberately lean and adds very few tokens to your context. It provides two specialized tools—`lookup` for instant fact-checking of API syntax and documentation details, and `answer` for comprehensive research with actionable recommendations.

### Setup

The package is published only as `@j4k-oss/perplexity-agent-mcp` on the `code.j4k.dev` registry. The unscoped `perplexity-agent-mcp` package on npmjs is frozen at its last version and gets no updates.

The `@j4k-oss` scope on npmjs is not confirmed as ours, so always map it to the `code.j4k.dev` registry. To do that once for every command, add this line to `~/.npmrc`:

```ini
@j4k-oss:registry=https://code.j4k.dev/api/packages/j4k-oss/npm/
```

The inline flag in the commands below is enough for a single `npx` run. Keep the `~/.npmrc` line for the global install: `npm update -g` and `npm outdated -g` read the registry from your configuration, so without the line they look the scoped name up on npmjs.org. Install the package globally:

```bash
npm install -g --@j4k-oss:registry=https://code.j4k.dev/api/packages/j4k-oss/npm/ @j4k-oss/perplexity-agent-mcp
```

If you installed the unscoped package globally, run `npm uninstall -g perplexity-agent-mcp` (or `pnpm remove -g perplexity-agent-mcp`) first: both packages provide the `perplexity-agent-mcp` command, npm refuses to overwrite it, and pnpm keeps running the old copy. To check the latest release without installing it:

```bash
npx -y --@j4k-oss:registry=https://code.j4k.dev/api/packages/j4k-oss/npm/ @j4k-oss/perplexity-agent-mcp@latest --version
```

In a pnpm project, map the scope to its registry and exempt it from `minimumReleaseAge` in `pnpm-workspace.yaml`, then add the package:

```yaml
registries:
  "@j4k-oss": https://code.j4k.dev/api/packages/j4k-oss/npm/
minimumReleaseAgeExclude:
  - "@j4k-oss/*"
```

```bash
pnpm add -D @j4k-oss/perplexity-agent-mcp
```

The package installs the `perplexity-agent-mcp` command and reports the MCP server name `perplexity-agent-mcp`.

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
