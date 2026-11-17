#!/usr/bin/env node
import { runMcpServer } from '../src/mcp.mjs';

runMcpServer().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : error}\n`);
  process.exitCode = 1;
});
