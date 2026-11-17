# VS Code (MCP)

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "agent-devtools-browser": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agent-devtools-browser", "mcp"]
    }
  }
}
```

From a checkout:

```json
{
  "servers": {
    "agent-devtools-browser": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/agent-devtools-browser/bin/mcp.mjs"]
    }
  }
}
```

The MCP server exposes `browser` and `browser_devtools`. Start with:

```text
browser { action: "open", url: "http://localhost:5173" }
```
