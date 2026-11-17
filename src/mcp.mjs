import readline from 'node:readline';

import { CdpBrowser } from './core.mjs';
import { createBrowserTools } from './tools.mjs';
import { textValue } from './util.mjs';

const SERVER_NAME = 'agent-devtools-browser';
const SERVER_VERSION = '0.1.0';

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  write({ jsonrpc: '2.0', id, result: value });
}

function failure(id, code, message) {
  write({ jsonrpc: '2.0', id, error: { code, message } });
}

/**
 * Minimal, dependency-free MCP stdio server.
 * Exposes the shared browser toolset as `browser` and `browser_devtools`.
 */
export async function runMcpServer(options = {}) {
  const browser = options.browser || new CdpBrowser();
  const tools = createBrowserTools(browser);

  const shutdown = () => {
    browser.dispose();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      failure(null, -32700, 'Parse error');
      return;
    }
    if (Array.isArray(message)) {
      failure(null, -32600, 'Batch requests are not supported');
      return;
    }
    if (typeof message !== 'object' || message === null) {
      failure(null, -32600, 'Invalid request');
      return;
    }
    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;
    try {
      switch (method) {
        case 'initialize':
          result(id, {
            protocolVersion: params && typeof params.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          });
          return;
        case 'notifications/initialized':
          return;
        case 'ping':
          result(id, {});
          return;
        case 'logging/setLevel':
          result(id, {});
          return;
        case 'tools/list':
          result(id, {
            tools: tools.schemas.map((schema) => ({
              name: schema.name,
              description: schema.description,
              inputSchema: schema.parameters,
            })),
          });
          return;
        case 'tools/call': {
          const name = params && typeof params.name === 'string' ? params.name : '';
          const args = params && typeof params.arguments === 'object' && params.arguments !== null ? params.arguments : {};
          try {
            const value = await tools.execute(name, args);
            const text = textValue(value);
            const content = [{ type: 'text', text }];
            if (value && typeof value === 'object') {
              result(id, { content, structuredContent: value, isError: false });
            } else {
              result(id, { content, isError: false });
            }
          } catch (error) {
            result(id, {
              content: [{ type: 'text', text: String(error && error.message ? error.message : error) }],
              isError: true,
            });
          }
          return;
        }
        default:
          if (isNotification) return;
          failure(id, -32601, `Method not found: ${String(method)}`);
      }
    } catch (error) {
      if (!isNotification) failure(id, -32603, String(error && error.message ? error.message : error));
    }
  });

  rl.on('close', () => {
    browser.dispose();
    process.exit(0);
  });
}

export { SERVER_NAME, SERVER_VERSION };
