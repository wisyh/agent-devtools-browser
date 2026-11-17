import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { CdpBrowser } from './core.mjs';
import { createBrowserTools } from './tools.mjs';
import { runMcpServer } from './mcp.mjs';

const execFileAsync = promisify(execFile);
const SESSION_DIR = path.join(os.homedir(), '.agent-devtools-browser');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');

function readSession() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function writeSession(value) {
  await fsp.mkdir(SESSION_DIR, { recursive: true, mode: 0o700 });
  await fsp.writeFile(SESSION_FILE, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function clearSession() {
  try { await fsp.unlink(SESSION_FILE); } catch { /* already gone */ }
}

async function portAlive(port) {
  if (!port) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

function print(value) {
  process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

async function attachBrowser() {
  const session = readSession();
  if (!session || !session.port) throw new Error('No browser session. Run "agent-devtools-browser open <url>" first.');
  if (!(await portAlive(session.port))) {
    await clearSession();
    throw new Error('The previous browser session is gone. Run "agent-devtools-browser open <url>" again.');
  }
  const browser = new CdpBrowser();
  await browser.attach(session.port, session.targetId);
  return { browser, session };
}

async function openCommand(url) {
  const existing = readSession();
  if (existing && existing.port && (await portAlive(existing.port))) {
    const browser = new CdpBrowser();
    await browser.attach(existing.port, existing.targetId);
    if (url) await browser.navigate(url);
    else await browser.send('Page.bringToFront').catch(() => {});
    const status = await browser.status();
    const browserName = status.browser || existing.browser || null;
    await writeSession({ port: status.port, pid: existing.pid || null, targetId: status.active, browser: browserName });
    print({ ...status, pid: existing.pid || status.pid || null, browser: browserName });
    browser.detach();
    return;
  }
  const browser = new CdpBrowser();
  await browser.launch({ detached: true });
  if (url) await browser.navigate(url);
  const status = await browser.status();
  await writeSession({ port: status.port, pid: status.pid || null, targetId: status.active, browser: status.browser });
  print(status);
  browser.detach();
}

async function closeCommand() {
  const session = readSession();
  if (session && session.pid) {
    try {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill', ['/PID', String(session.pid), '/T', '/F']);
      } else {
        try { process.kill(-session.pid, 'SIGTERM'); } catch { process.kill(session.pid, 'SIGTERM'); }
      }
    } catch {
      /* the process may already be gone */
    }
  }
  await clearSession();
  print({ ok: true, closed: Boolean(session) });
}

async function toolCommand(name, args) {
  const { browser } = await attachBrowser();
  try {
    const tools = createBrowserTools(browser);
    print(await tools.execute(name, args));
  } finally {
    browser.dispose();
  }
}

function usage() {
  return `agent-devtools-browser <command> [args]

Commands:
  open [url]            Launch Edge/Chrome with the real DevTools open (detached)
  status                Show the active page, port and tabs
  navigate <url>        Navigate the active tab
  eval <code>           Evaluate JavaScript in the page
  snapshot [mode]       Print the interactive DOM/text/HTML snapshot
  extract <selector>    Extract rows from matching elements
  inspect <selector>    Inspect an element and its computed styles
  network               Print CDP-captured network entries
  console               Print CDP-captured console entries
  screenshot            Capture a PNG and print its path
  tabs [list|new|select|close] [id|url]
  close                 Kill the browser session
  mcp                   Run the MCP stdio server

Environment:
  AGENT_DEVTOOLS_BROWSER  Path to the Edge/Chrome executable
`;
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'mcp':
      await runMcpServer();
      return;
    case 'open':
      await openCommand(rest[0]);
      return;
    case 'close':
      await closeCommand();
      return;
    case 'status': {
      const { browser, session } = await attachBrowser();
      const status = await browser.status();
      print({ ...status, pid: session.pid || status.pid || null, browser: status.browser || session.browser || null });
      browser.dispose();
      return;
    }
    case 'navigate':
      await toolCommand('browser', { action: 'navigate', url: rest[0] });
      return;
    case 'eval':
      await toolCommand('browser_devtools', { action: 'eval', code: rest.join(' ') });
      return;
    case 'snapshot':
      await toolCommand('browser', { action: 'snapshot', mode: rest[0] || 'interactive' });
      return;
    case 'extract':
      await toolCommand('browser_devtools', { action: 'extract', selector: rest[0] });
      return;
    case 'inspect':
      await toolCommand('browser_devtools', { action: 'inspect', selector: rest[0] });
      return;
    case 'network':
      await toolCommand('browser_devtools', { action: 'network', limit: 100 });
      return;
    case 'console':
      await toolCommand('browser_devtools', { action: 'console', limit: 100 });
      return;
    case 'screenshot':
      await toolCommand('browser_devtools', { action: 'screenshot' });
      return;
    case 'tabs': {
      const sub = rest[0] || 'list';
      if (sub === 'list') await toolCommand('browser', { action: 'tabs', tabAction: 'list' });
      else if (sub === 'new') await toolCommand('browser', { action: 'tabs', tabAction: 'new', url: rest[1] });
      else if (sub === 'select') await toolCommand('browser', { action: 'tabs', tabAction: 'select', tabId: rest[1] });
      else if (sub === 'close') await toolCommand('browser', { action: 'tabs', tabAction: 'close', tabId: rest[1] });
      else throw new Error(`Unknown tabs command: ${sub}`);
      return;
    }
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(usage());
      return;
    default:
      throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}
