#!/usr/bin/env node
import { runCli } from '../src/cli.mjs';

runCli().catch((error) => {
  process.stderr.write(`${error && error.message ? error.message : error}\n`);
  process.exitCode = 1;
});
