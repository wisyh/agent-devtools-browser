import assert from 'node:assert/strict';
import test from 'node:test';

import { BROWSER_PARAMETERS, DEVTOOLS_PARAMETERS, TOOL_SCHEMAS, createBrowserTools } from '../src/tools.mjs';

test('schemas expose the browser and devtools tools', () => {
  assert.deepEqual(TOOL_SCHEMAS.map((schema) => schema.name), ['browser', 'browser_devtools']);
  assert.ok(BROWSER_PARAMETERS.properties.action.enum.includes('open'));
  assert.ok(BROWSER_PARAMETERS.properties.action.enum.includes('snapshot'));
  assert.ok(DEVTOOLS_PARAMETERS.properties.action.enum.includes('eval'));
  assert.ok(DEVTOOLS_PARAMETERS.properties.action.enum.includes('screenshot'));
  assert.equal(BROWSER_PARAMETERS.required[0], 'action');
  assert.equal(DEVTOOLS_PARAMETERS.required[0], 'action');
});

test('unknown tools and missing required arguments fail clearly', async () => {
  const fake = { ensure: async () => {} };
  const tools = createBrowserTools(fake);
  await assert.rejects(tools.execute('unknown', {}), /Unknown tool/);
  await assert.rejects(tools.execute('browser', { action: 'navigate' }), /requires a url/);
  await assert.rejects(tools.execute('browser_devtools', { action: 'eval' }), /requires code/);
  await assert.rejects(tools.execute('browser', { action: 'click' }), /requires selector, text, or both x and y/);
});
