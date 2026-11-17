# Codex / OpenAI-compatible agents

## MCP server

The npm package is not published yet, so use a checkout. `~/.codex/config.toml`:

```toml
[mcp_servers.agent-devtools-browser]
command = "node"
args = ["/absolute/path/to/agent-devtools-browser/bin/mcp.mjs"]
```

## Instructions

Codex reads `AGENTS.md` from the repository root. For a project that uses this tool, add a short `AGENTS.md` section:

```markdown
## Browser
Use the `browser` and `browser_devtools` MCP tools for real-browser tasks.
Start with `browser { action: "open", url }`. The browser opens with the real DevTools.
Full loop: agent-devtools-browser/skill/SKILL.md.
```
