# Contributing

Thanks for helping. This project is intentionally small and dependency-free.

## Development

Requirements: Node.js 22 or newer, and Edge or Chrome for manual testing.

```bash
git clone https://github.com/wisyh/agent-devtools-browser.git
cd agent-devtools-browser
npm test
```

There are no runtime dependencies, so `npm install` is optional.

Manual check:

```bash
node ./bin/agent-devtools-browser.mjs open https://example.com
node ./bin/agent-devtools-browser.mjs eval "document.title"
node ./bin/agent-devtools-browser.mjs screenshot
node ./bin/agent-devtools-browser.mjs close
```

MCP check (stdio JSON-RPC):

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node ./bin/mcp.mjs
```

## Rules

- Keep `src/` portable: no Cordis, no DSH, no editor-specific imports.
- Keep `skill/SKILL.md` aligned with the schemas in `src/tools.mjs`.
- Add a test for URL parsing, tool schemas, or other pure logic.
- Do not commit browser profiles, session files, screenshots with private data,
  or a CDP port.
- Security-sensitive changes (launch flags, CDP binding, JavaScript evaluation)
  need a short note in the pull request.
- Prefer small focused pull requests. Describe the user-visible result and how
  you verified it.

## Commit style

Conventional-ish, imperative subject lines, for example:

```text
feat: expose network body previews
fix: close the browser when the MCP server exits
docs: add Cursor setup
```

## License

By contributing you agree that your contribution is licensed under the MIT
License.
