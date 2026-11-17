# AGENTS.md

This repository ships a real-browser tool for AI agents. There are two audiences:

## If you are using the browser tool

- The capability comes from the `agent-devtools-browser` MCP server (or the CLI). The portable instructions are in [`skill/SKILL.md`](skill/SKILL.md); load that skill before using the tools.
- Tools: `browser` and `browser_devtools`.
- Start with `browser { action: "open", url: "..." }`. This launches Edge/Chrome with the real Chromium DevTools open.
- Read [`skill/references/tools.md`](skill/references/tools.md) for full actions, extraction examples, and troubleshooting.
- Do not pretend the DevTools UI is part of this project. It is the browser's own DevTools.
- The page runs in an external window. The agent reads data through CDP; the human can use the real DevTools.

## If you are contributing to this repository

- Node.js 22+, ESM, zero runtime dependencies.
- `npm test` runs the Node test runner; there is no install step unless dependencies are added later.
- Keep the portable core (`src/`) free of DSH/Cordis imports. Host-specific code belongs in `adapters/`.
- Keep `skill/SKILL.md` aligned with the tool schemas in `src/tools.mjs`.
- Do not commit CDP ports, session files, browser profiles, or screenshots with user data.
- Security-sensitive changes (launch flags, CDP binding, arbitrary JS) need a note in the PR.

## Layout

- `src/core.mjs` — browser launch and CDP client.
- `src/tools.mjs` — `browser` and `browser_devtools` schemas and execution.
- `src/page.mjs` — page-side helpers via `Runtime.evaluate`.
- `src/mcp.mjs` — MCP stdio server.
- `src/cli.mjs` — CLI and session file.
- `adapters/dsh/` — optional DeepSeek Harness Host adapter.
- `skill/` — portable Agent Skill.
- `examples/` — per-client setup.
