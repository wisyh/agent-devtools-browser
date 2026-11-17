import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { normalizeUrl } from './util.mjs';

const CDP_HOST = '127.0.0.1';

const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChromium() {
  const fromEnv = process.env.AGENT_DEVTOOLS_BROWSER;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const candidate of BROWSER_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* keep looking */
    }
  }
  throw new Error('Microsoft Edge or Google Chrome was not found. Set AGENT_DEVTOOLS_BROWSER to the browser executable.');
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, CDP_HOST, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error('Could not allocate a CDP port'))));
    });
  });
}

export async function waitForCdp(port, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${CDP_HOST}:${port}/json/version`, { signal: AbortSignal.timeout(900) });
      if (response.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`The external browser did not expose a DevTools endpoint on port ${port}.`);
}

export class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }

  isOpen() {
    return Boolean(this.ws) && this.ws.readyState === 1;
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('Timed out connecting to the browser DevTools endpoint'));
      }, 12_000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Could not connect to the browser DevTools endpoint'));
      });
      ws.addEventListener('message', (event) => this.onMessage(event));
      ws.addEventListener('close', () => {
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new Error('The browser DevTools connection closed'));
        }
        this.pending.clear();
      });
    });
  }

  onMessage(event) {
    if (typeof event.data !== 'string') return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed'));
      else pending.resolve(message.result || {});
      return;
    }
    if (typeof message.method === 'string') {
      const callbacks = this.handlers.get(message.method);
      if (callbacks) {
        for (const callback of Array.from(callbacks)) {
          try { callback(message.params || {}); } catch { /* a listener must not break the stream */ }
        }
      }
    }
  }

  on(method, callback) {
    let callbacks = this.handlers.get(method);
    if (!callbacks) {
      callbacks = new Set();
      this.handlers.set(method, callbacks);
    }
    callbacks.add(callback);
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) this.handlers.delete(method);
    };
  }

  waitFor(method, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const off = this.on(method, (params) => {
        if (done) return;
        done = true;
        off();
        clearTimeout(timer);
        resolve(params);
      });
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        off();
        resolve(null);
      }, timeoutMs);
    });
  }

  send(method, params = {}, timeoutMs = 45_000) {
    if (!this.isOpen()) return Promise.reject(new Error('The browser DevTools connection is not open'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command "${method}" timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  close() {
    if (!this.ws) return;
    try { this.ws.close(); } catch { /* ignore */ }
    this.ws = null;
    this.pending.clear();
  }
}

export class CdpBrowser {
  constructor() {
    this.exe = null;
    this.port = null;
    this.child = null;
    this.client = null;
    this.targetId = null;
    this.targets = [];
    this.network = [];
    this.console = [];
    this.networkById = new Map();
    this.starting = null;
    this.profileDir = null;
  }

  async ensure() {
    if (this.client && this.client.isOpen()) return;
    if (this.starting) return this.starting;
    this.starting = this.launch();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async launch(options = {}) {
    this.exe = options.executable || findChromium();
    const port = await freePort();
    this.port = port;
    const directory = path.join(os.tmpdir(), 'agent-devtools-browser', `profile-${process.pid}-${Date.now()}`);
    await fs.promises.mkdir(directory, { recursive: true });
    this.profileDir = directory;
    const args = [
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${directory}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-background-networking',
      '--auto-open-devtools-for-tabs',
      '--window-size=1280,900',
      '--window-position=40,40',
      'about:blank',
    ];
    this.child = spawn(this.exe, args, {
      stdio: 'ignore',
      windowsHide: false,
      detached: options.detached === true,
    });
    if (options.detached === true) this.child.unref();
    this.child.once('exit', () => {
      this.child = null;
      this.client?.close();
      this.client = null;
      this.port = null;
    });
    await waitForCdp(port);
    const pages = await this.listTargets();
    const target = pages[0] || (await this.createTarget('about:blank'));
    await this.connectTarget(target.id);
  }

  async attach(port, targetId) {
    this.port = port;
    this.exe = null;
    const pages = await this.listTargets();
    if (pages.length === 0) throw new Error(`No page target is available on CDP port ${port}`);
    await this.connectTarget(targetId || pages[0].id);
  }

  async listTargets() {
    if (!this.port) return [];
    const response = await fetch(`http://${CDP_HOST}:${this.port}/json/list`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not list browser targets (HTTP ${response.status})`);
    const list = await response.json();
    return list.filter((entry) => entry.type === 'page' && !/^(devtools|chrome-devtools):\/\//i.test(String(entry.url || '')));
  }

  async createTarget(url) {
    const endpoint = `http://${CDP_HOST}:${this.port}/json/new?${encodeURIComponent(url || 'about:blank')}`;
    const response = await fetch(endpoint, { method: 'PUT' });
    if (!response.ok) throw new Error(`Could not create a browser tab (HTTP ${response.status})`);
    return await response.json();
  }

  async closeTarget(targetId) {
    const response = await fetch(`http://${CDP_HOST}:${this.port}/json/close/${encodeURIComponent(targetId)}`, { method: 'GET' });
    if (!response.ok) throw new Error(`Could not close the browser tab (HTTP ${response.status})`);
  }

  async connectTarget(targetId) {
    const targets = await this.listTargets();
    const info = targets.find((entry) => entry.id === targetId) || targets[0];
    if (!info) throw new Error('The external browser has no page target');
    if (this.client) this.client.close();
    const client = new CdpClient(info.webSocketDebuggerUrl);
    await client.open();
    this.client = client;
    this.targetId = info.id;
    this.targets = targets;
    this.network = [];
    this.console = [];
    this.networkById.clear();
    this.bindEvents(client);
    await client.send('Page.enable').catch(() => {});
    await client.send('Runtime.enable').catch(() => {});
    await client.send('Network.enable').catch(() => {});
    await client.send('Log.enable').catch(() => {});
    await client.send('Performance.enable').catch(() => {});
  }

  bindEvents(client) {
    client.on('Network.requestWillBeSent', (params) => {
      const request = params.request || {};
      const record = {
        id: params.requestId,
        kind: String(params.type || 'request').toLowerCase(),
        method: String(request.method || 'GET').toUpperCase(),
        url: String(request.url || '').slice(0, 4000),
        started: Date.now(),
        status: null,
        ms: null,
        size: null,
        mimeType: '',
        error: '',
        body: '',
        at: params.timestamp,
      };
      this.network.push(record);
      this.networkById.set(params.requestId, record);
      if (this.network.length > 500) {
        const removed = this.network.shift();
        if (removed) this.networkById.delete(removed.id);
      }
    });
    client.on('Network.responseReceived', (params) => {
      const record = this.networkById.get(params.requestId);
      if (!record) return;
      record.status = params.response?.status ?? null;
      record.mimeType = params.response?.mimeType || '';
      record.type = params.type || record.kind;
    });
    client.on('Network.loadingFinished', (params) => {
      const record = this.networkById.get(params.requestId);
      if (!record) return;
      record.size = params.encodedDataLength ?? null;
      if (typeof params.timestamp === 'number' && typeof record.at === 'number') {
        record.ms = Math.max(0, Math.round((params.timestamp - record.at) * 1000));
      }
      client.send('Network.getResponseBody', { requestId: params.requestId }, 10_000)
        .then((body) => {
          if (body && body.base64Encoded !== true) record.body = String(body.body || '').slice(0, 4000);
        })
        .catch(() => {});
    });
    client.on('Network.loadingFailed', (params) => {
      const record = this.networkById.get(params.requestId);
      if (!record) return;
      record.error = String(params.errorText || 'Request failed');
    });
    client.on('Runtime.consoleAPICalled', (params) => {
      const text = (params.args || []).map((arg) => {
        if (arg.value !== undefined) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
        return String(arg.description || arg.type || '');
      }).join(' ');
      this.pushConsole(params.type || 'log', text);
    });
    client.on('Runtime.exceptionThrown', (params) => {
      const details = params.exceptionDetails || {};
      const text = details.exception?.description || details.text || 'Uncaught exception';
      this.pushConsole('error', text);
    });
    client.on('Log.entryAdded', (params) => {
      const entry = params.entry || {};
      this.pushConsole(entry.level || 'info', entry.text || '');
    });
    client.on('Page.javascriptDialogOpening', () => {
      client.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    });
  }

  pushConsole(level, text) {
    const normalized = String(text == null ? '' : text).slice(0, 5000);
    this.console.push({ level: String(level), text: normalized, at: Date.now() });
    if (this.console.length > 500) this.console.shift();
  }

  async send(method, params = {}, timeoutMs) {
    if (!this.client) throw new Error('The external browser is not connected');
    return this.client.send(method, params, timeoutMs);
  }

  async evaluate(expression, options = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      ...options,
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Page evaluation failed';
      throw new Error(description);
    }
    return result.result ? result.result.value : undefined;
  }

  async pageInfo() {
    try {
      return await this.evaluate('({ url: location.href, title: document.title, readyState: document.readyState })');
    } catch {
      return { url: '', title: '', readyState: '' };
    }
  }

  async navigate(value, timeoutMs = 45_000) {
    const url = normalizeUrl(value);
    const loaded = this.client.waitFor('Page.loadEventFired', Math.max(2_000, Math.min(120_000, timeoutMs)));
    const result = await this.send('Page.navigate', { url });
    if (result.errorText) throw new Error(result.errorText);
    await loaded;
    await this.send('Page.bringToFront').catch(() => {});
    const info = await this.pageInfo();
    return { ok: true, url: info.url || url, title: info.title || '' };
  }

  async history(delta) {
    const history = await this.send('Page.getNavigationHistory');
    const target = history.currentIndex + delta;
    if (target < 0 || target >= history.entries.length) {
      throw new Error(delta < 0 ? 'No back history' : 'No forward history');
    }
    const loaded = this.client.waitFor('Page.loadEventFired', 20_000);
    await this.send('Page.navigateToHistoryEntry', { entryId: history.entries[target].id });
    await loaded;
    const info = await this.pageInfo();
    return { ok: true, url: info.url, title: info.title };
  }

  async reload() {
    const loaded = this.client.waitFor('Page.loadEventFired', 20_000);
    await this.send('Page.reload', { ignoreCache: false });
    await loaded;
    const info = await this.pageInfo();
    return { ok: true, url: info.url, title: info.title };
  }

  async screenshot() {
    const result = await this.send('Page.captureScreenshot', { format: 'png' });
    if (!result.data) throw new Error('The browser returned no screenshot data');
    return result.data;
  }

  async open(url) {
    await this.ensure();
    if (url) await this.navigate(url);
    else await this.send('Page.bringToFront').catch(() => {});
    return this.status();
  }

  async status() {
    if (!this.port) {
      return { ok: true, running: false, port: null, pid: null, pageUrl: '', pageTitle: '', targets: [], active: null, browser: null };
    }
    try {
      const targets = await this.listTargets();
      this.targets = targets;
      let info = { url: '', title: '' };
      if (this.client && this.client.isOpen()) info = await this.pageInfo();
      return {
        ok: true,
        running: Boolean(this.client && this.client.isOpen()),
        port: this.port,
        pid: this.child ? this.child.pid : null,
        browser: this.exe ? path.basename(this.exe) : null,
        pageUrl: info.url || '',
        pageTitle: info.title || '',
        active: this.targetId,
        targets: targets.map((target) => ({
          id: target.id,
          title: String(target.title || '').slice(0, 300),
          url: String(target.url || '').slice(0, 4000),
          active: target.id === this.targetId,
        })),
      };
    } catch (error) {
      return { ok: false, running: false, port: this.port, error: String(error?.message ?? error), targets: [] };
    }
  }

  async newTab(url) {
    await this.ensure();
    const target = await this.createTarget(url ? normalizeUrl(url) : 'about:blank');
    await this.connectTarget(target.id);
    await this.send('Page.bringToFront').catch(() => {});
    return this.status();
  }

  async selectTab(targetId) {
    await this.connectTarget(targetId);
    await this.send('Page.bringToFront').catch(() => {});
    return this.status();
  }

  async closeTab(targetId) {
    await this.ensure();
    await this.closeTarget(targetId);
    const remaining = await this.listTargets();
    if (remaining.length === 0) {
      const target = await this.createTarget('about:blank');
      await this.connectTarget(target.id);
    } else if (this.targetId === targetId) {
      await this.connectTarget(remaining[0].id);
    }
    return this.status();
  }

  networkEntries(limit, clear) {
    const entries = this.network.slice(-limit).map((entry) => ({ ...entry, body: entry.body ? entry.body.slice(0, 4000) : '' }));
    if (clear) this.network = [];
    return { ok: true, entries, total: this.network.length };
  }

  consoleEntries(limit, clear) {
    const entries = this.console.slice(-limit);
    if (clear) this.console = [];
    return { ok: true, entries, total: this.console.length };
  }

  /** Close only the CDP socket; leave a detached browser running (CLI session mode). */
  detach() {
    if (this.client) this.client.close();
    this.client = null;
    this.targetId = null;
    this.port = null;
    this.targets = [];
    this.network = [];
    this.console = [];
    this.networkById.clear();
    this.child = null;
  }

  dispose() {
    if (this.client) this.client.close();
    this.client = null;
    this.targetId = null;
    this.port = null;
    this.targets = [];
    this.network = [];
    this.console = [];
    this.networkById.clear();
    if (this.child) {
      try { this.child.kill(); } catch { /* already gone */ }
    }
    this.child = null;
  }
}
