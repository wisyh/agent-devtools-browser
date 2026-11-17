# Claude Code / Claude Desktop

## MCP server

Claude Code:

```bash
claude mcp add agent-devtools-browser -- npx -y agent-devtools-browser mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-devtools-browser": {
      "command": "npx",
      "args": ["-y", "agent-devtools-browser", "mcp"]
    }
  }
}
```

From a checkout, replace the command with `node` and the args with the absolute path to `bin/mcp.mjs`.

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
