import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { clamp, detectEvalMode, normalizeUrl } from './util.mjs';
import {
  evalCode,
  pageCall,
  pageClick,
  pageExtract,
  pageInspect,
  pagePerformance,
  pageSnapshot,
  pageStorage,
  pageType,
  pageWait,
} from './page.mjs';

export const BROWSER_DESCRIPTION =
  'Launch and drive a real Microsoft Edge/Google Chrome window with the real Chromium DevTools open. Use action "open" to start it; then navigate, inspect, click, type, wait, and manage tabs. The page and DevTools are visible in the external browser window.';

export const DEVTOOLS_DESCRIPTION =
  'Read and drive the external browser through the Chrome DevTools Protocol: evaluate JavaScript, extract structured data, inspect CSS, read CDP-captured console/network, read or write page storage, take a screenshot, and inspect performance. The same page is visible with the real Chromium DevTools in the external window.';

const TAB_PARAM = {
  type: 'string',
  description: 'Browser tab id. Defaults to the active tab; use action "tabs" to list ids.',
};

export const BROWSER_PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['open', 'navigate', 'back', 'forward', 'reload', 'snapshot', 'click', 'type', 'wait', 'tabs', 'status', 'close'],
      description: 'Browser operation to perform.',
    },
    url: {
      type: 'string',
      description: 'Target URL for open and navigate. A missing scheme becomes https://; localhost becomes http://. Only http and https are supported.',
    },
    tab: TAB_PARAM,
    newTab: {
      type: 'boolean',
      description: 'With open: create another browser tab instead of reusing the active tab.',
    },
    selector: {
      type: 'string',
      description: 'CSS selector for click, type, and wait. Prefer an id, data attribute, or a short structural selector.',
    },
    text: {
      type: 'string',
      description: 'For click without a selector: visible text to match. For type: the text to enter. For wait without a selector: text to wait for.',
    },
    x: {
      type: 'number',
      description: 'Viewport x coordinate for a real CDP pointer click on canvas/custom widgets.',
    },
    y: {
      type: 'number',
      description: 'Viewport y coordinate for a real CDP pointer click on canvas/custom widgets.',
    },
    index: {
      type: 'integer',
      description: '0-based match to click when the selector or text matches several elements. Defaults to 0.',
    },
    enter: {
      type: 'boolean',
      description: 'With type: press Enter after entering the text (submits most forms).',
    },
    mode: {
      type: 'string',
      enum: ['interactive', 'text', 'dom', 'html'],
      description: 'Snapshot shape. interactive lists visible controls with selectors; text returns readable text; dom returns a bounded outline; html returns page HTML. Defaults to interactive.',
    },
    depth: {
      type: 'integer',
      description: 'Maximum DOM outline depth for snapshot mode "dom". Defaults to 6.',
    },
    maxChars: {
      type: 'integer',
      description: 'Maximum characters of page text or HTML to return. Defaults to 12000.',
    },
    tabAction: {
      type: 'string',
      enum: ['list', 'new', 'select', 'close'],
      description: 'Sub-action for action "tabs". Defaults to list.',
    },
    tabId: {
      type: 'string',
      description: 'Target tab id for tabAction select or close.',
    },
    timeoutMs: {
      type: 'integer',
      description: 'Maximum wait in milliseconds for navigation, wait, or the command itself. Defaults to 15000 for wait and 45000 elsewhere.',
    },
  },
  required: ['action'],
};

export const DEVTOOLS_PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['eval', 'extract', 'inspect', 'network', 'console', 'storage', 'performance', 'screenshot'],
      description: 'Developer-tools operation to perform through the Chrome DevTools Protocol.',
    },
    code: {
      type: 'string',
      description: 'JavaScript to evaluate in the page for action eval. An expression returns its value; a statement block needs return. Top-level await is supported.',
    },
    tab: TAB_PARAM,
    selector: {
      type: 'string',
      description: 'For inspect: the element to inspect. For extract: the repeating item selector. Defaults to body for inspect and to a direct children scan for extract.',
    },
    fields: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'For extract: field name to selector relative to each item. A selector ending in @attr reads that attribute (@href, @src, @value). "text" and "html" read the item itself.',
    },
    limit: {
      type: 'integer',
      description: 'Maximum rows or entries to return. Defaults to 50.',
    },
    area: {
      type: 'string',
      enum: ['local', 'session', 'cookies', 'all'],
      description: 'Storage area for action storage. Defaults to all.',
    },
    mode: {
      type: 'string',
      enum: ['get', 'set', 'clear'],
      description: 'Storage operation. Defaults to get.',
    },
    key: {
      type: 'string',
      description: 'Storage key for mode set.',
    },
    value: {
      type: 'string',
      description: 'Storage value for mode set.',
    },
    clear: {
      type: 'boolean',
      description: 'With network or console: clear the captured entries before returning.',
    },
    timeoutMs: {
      type: 'integer',
      description: 'Maximum command time in milliseconds. Defaults to 45000.',
    },
  },
  required: ['action'],
};

export const TOOL_SCHEMAS = [
  { name: 'browser', description: BROWSER_DESCRIPTION, parameters: BROWSER_PARAMETERS },
  { name: 'browser_devtools', description: DEVTOOLS_DESCRIPTION, parameters: DEVTOOLS_PARAMETERS },
];

async function saveScreenshot(base64) {
  const directory = path.join(os.tmpdir(), 'agent-devtools-browser');
  await fsp.mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(directory, `shot-${stamp}.png`);
  const bytes = Buffer.from(base64, 'base64');
  await fsp.writeFile(file, bytes);
  return { ok: true, path: file, bytes: bytes.length, hint: 'Read this PNG with the read_image tool.' };
}

/**
 * One toolset shared by the MCP server, the CLI and the DSH adapter.
 * @param {import('./core.mjs').CdpBrowser} browser
 */
export function createBrowserTools(browser) {
  async function executeBrowser(input) {
    const action = String(input.action ?? '');
    const timeoutMs = clamp(input.timeoutMs, 1_000, 120_000, 45_000);
    switch (action) {
      case 'open': {
        const url = input.url === undefined || input.url === '' ? undefined : String(input.url);
        if (input.newTab === true) return await browser.newTab(url);
        return await browser.open(url);
      }
      case 'navigate': {
        if (!input.url) throw new Error('navigate requires a url');
        await browser.ensure();
        return await browser.navigate(String(input.url), timeoutMs);
      }
      case 'back':
      case 'forward': {
        await browser.ensure();
        return await browser.history(action === 'back' ? -1 : 1);
      }
      case 'reload': {
        await browser.ensure();
        return await browser.reload();
      }
      case 'snapshot': {
        await browser.ensure();
        return await browser.evaluate(pageCall(pageSnapshot, [
          input.mode ?? 'interactive',
          clamp(input.depth, 1, 12, 6),
          clamp(input.maxChars, 500, 60_000, 12_000),
        ]));
      }
      case 'click': {
        await browser.ensure();
        if (typeof input.x === 'number' && typeof input.y === 'number') {
          const x = Math.round(input.x);
          const y = Math.round(input.y);
          await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
          await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
          return { ok: true, mode: 'pointer', x, y };
        }
        if (input.selector === undefined && input.text === undefined) {
          throw new Error('click requires selector, text, or both x and y');
        }
        const value = await browser.evaluate(pageCall(pageClick, [
          input.selector === undefined ? undefined : String(input.selector),
          input.text === undefined ? undefined : String(input.text),
          clamp(input.index, 0, 10_000, 0),
        ]));
        if (value && value.ok === false) throw new Error(value.error || 'Click target not found');
        return value;
      }
      case 'type': {
        await browser.ensure();
        if (input.selector === undefined) throw new Error('type requires selector');
        const value = await browser.evaluate(pageCall(pageType, [
          String(input.selector),
          input.text === undefined ? '' : String(input.text),
        ]));
        if (value && value.ok === false) throw new Error(value.error || 'Type target not found');
        if (input.enter === true) {
          await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
          await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
        }
        return value;
      }
      case 'wait': {
        await browser.ensure();
        const started = Date.now();
        const limit = clamp(input.timeoutMs, 500, 120_000, 15_000);
        if (!input.selector && !input.text) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(limit, 500)));
          return { ok: true, found: true, elapsed: Date.now() - started };
        }
        while (Date.now() - started < limit) {
          const value = await browser.evaluate(pageCall(pageWait, [input.selector, input.text]));
          if (value && value.found) return { ok: true, found: true, elapsed: Date.now() - started };
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return { ok: true, found: false, timedOut: true, elapsed: Date.now() - started };
      }
      case 'tabs': {
        await browser.ensure();
        const tabAction = input.tabAction ?? 'list';
        if (tabAction === 'list') {
          const status = await browser.status();
          return { ok: true, active: status.active, tabs: status.targets };
        }
        if (tabAction === 'new') return await browser.newTab(input.url === undefined ? undefined : String(input.url));
        if (tabAction === 'select') {
          if (!input.tabId) throw new Error('tabs select requires tabId');
          return await browser.selectTab(String(input.tabId));
        }
        if (tabAction === 'close') {
          if (!input.tabId) throw new Error('tabs close requires tabId');
          return await browser.closeTab(String(input.tabId));
        }
        throw new Error(`Unknown tabs action: ${tabAction}`);
      }
      case 'status':
        return await browser.status();
      case 'close':
        browser.dispose();
        return { ok: true, running: false };
      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }

  async function executeDevtools(input) {
    const action = String(input.action ?? '');
    switch (action) {
      case 'eval': {
        if (typeof input.code !== 'string' || input.code.trim() === '') throw new Error('eval requires code');
        await browser.ensure();
        const value = await browser.evaluate(evalCode(input.code, detectEvalMode(input.code)));
        if (value && value.ok === false) throw new Error(value.error);
        return { ok: true, value: value ? value.value : null };
      }
      case 'extract':
        await browser.ensure();
        return await browser.evaluate(pageCall(pageExtract, [
          input.selector === undefined ? undefined : String(input.selector),
          input.fields && typeof input.fields === 'object' ? input.fields : undefined,
          clamp(input.limit, 1, 500, 50),
        ]));
      case 'inspect':
        await browser.ensure();
        if (!input.selector) throw new Error('inspect requires a selector');
        return await browser.evaluate(pageCall(pageInspect, [String(input.selector)]));
      case 'network':
        await browser.ensure();
        return browser.networkEntries(clamp(input.limit, 1, 500, 50), input.clear === true);
      case 'console':
        await browser.ensure();
        return browser.consoleEntries(clamp(input.limit, 1, 500, 100), input.clear === true);
      case 'storage':
        await browser.ensure();
        return await browser.evaluate(pageCall(pageStorage, [
          input.area ?? 'all',
          input.mode ?? 'get',
          input.key === undefined ? undefined : String(input.key),
          input.value === undefined ? undefined : String(input.value),
        ]));
      case 'performance':
        await browser.ensure();
        return await browser.evaluate(pageCall(pagePerformance, [clamp(input.limit, 1, 500, 100)]));
      case 'screenshot': {
        await browser.ensure();
        return await saveScreenshot(await browser.screenshot());
      }
      default:
        throw new Error(`Unknown browser_devtools action: ${action}`);
    }
  }

  return {
    schemas: TOOL_SCHEMAS,
    async execute(name, args) {
      const input = args && typeof args === 'object' ? args : {};
      if (name === 'browser') return await executeBrowser(input);
      if (name === 'browser_devtools') return await executeDevtools(input);
      throw new Error(`Unknown tool: ${name}`);
    },
  };
}
