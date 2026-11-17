# Cursor

## MCP server

Create `.cursor/mcp.json` in the project (or use the global MCP settings). The npm package is not published yet, so use a checkout:

```json
{
  "mcpServers": {
    "agent-devtools-browser": {
      "command": "node",
      "args": ["C:/absolute/path/to/agent-devtools-browser/bin/mcp.mjs"]
    }
  }
}
```

## Rule / skill

Create `.cursor/rules/agent-devtools-browser.mdc`:

```markdown
---
description: Use the real Chromium DevTools browser through the agent-devtools-browser MCP tools.
globs:
alwaysApply: false
---

When a task needs a real browser, use the `browser` and `browser_devtools` MCP tools.
Start with `browser { action: "open", url }`. Follow skill/SKILL.md for the full loop.
```

Cursor does not load Anthropic-style `SKILL.md` directly, but it can read the same file if you reference it from a rule.
