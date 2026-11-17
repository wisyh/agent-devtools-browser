# Claude Code / Claude Desktop

## MCP server

The npm package is not published yet, so point the client at a checkout.

Claude Code:

```bash
claude mcp add agent-devtools-browser -- node /absolute/path/to/agent-devtools-browser/bin/mcp.mjs
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-devtools-browser": {
      "command": "node",
      "args": ["/absolute/path/to/agent-devtools-browser/bin/mcp.mjs"]
    }
  }
}
```

After publishing, the same config can use `npx -y agent-devtools-browser mcp`.

## Skill

Copy the skill directory into Claude's skills directory:

```bash
mkdir -p ~/.claude/skills
cp -r ./skill ~/.claude/skills/agent-devtools-browser
```

Or copy it into a project's `.claude/skills/agent-devtools-browser/`.

## First call

```text
browser { action: "open", url: "http://localhost:5173" }
```

The real Edge/Chrome window opens with DevTools docked. Claude uses `browser` and `browser_devtools` for the page.
