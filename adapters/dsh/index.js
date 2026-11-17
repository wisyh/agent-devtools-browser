import fs from 'node:fs';

import { CdpBrowser } from '../../src/core.mjs';
import { createBrowserTools } from '../../src/tools.mjs';
import { textValue } from '../../src/util.mjs';

const skillSource = fs.readFileSync(new URL('../../skill/SKILL.md', import.meta.url), 'utf8');
const skillContent = skillSource.replace(/^---[\s\S]*?---\s*/, '');

export const name = 'agent-devtools-browser';
export const inject = ['tools'];

const SKILL_DESCRIPTION =
  'Launch a real Edge/Chrome window with the real Chromium DevTools open, then drive and inspect the page over the Chrome DevTools Protocol.';
const SKILL_WHEN =
  'Use when a task needs a real browser in DSH Desktop: checking a local dev server, reproducing a UI bug, reading data from a JavaScript-heavy page, or using the real DevTools Elements/Console/Network data.';

export function apply(ctx) {
  ctx.effect(() => {
    const browser = new CdpBrowser();
    const tools = createBrowserTools(browser);
    const disposers = [];

    for (const schema of tools.schemas) {
      disposers.push(ctx.tools.register({
        name: schema.name,
        description: schema.description,
        parameters: schema.parameters,
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, value) => [{ type: 'text', text: textValue(value) }],
        },
        timeoutMs: 120_000,
        execute: (args) => tools.execute(schema.name, args),
      }));
    }

    const skills = ctx.get('skills');
    if (skills && typeof skills.register === 'function') {
      try {
        disposers.push(skills.register({
          name: 'agent-devtools-browser',
          description: SKILL_DESCRIPTION,
          whenToUse: SKILL_WHEN,
          content: skillContent,
          source: 'runtime',
          invocation: { modelInvocable: true, userInvocable: true },
        }));
      } catch (error) {
        console.error('[agent-devtools-browser] could not register skill:', error);
      }
    }

    return () => {
      browser.dispose();
      for (const dispose of disposers.splice(0)) {
        try { dispose(); } catch { /* already disposed */ }
      }
    };
  });
}
