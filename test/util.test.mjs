import assert from 'node:assert/strict';
import test from 'node:test';

import { clamp, detectEvalMode, normalizeUrl, textValue } from '../src/util.mjs';

test('normalizeUrl adds schemes and handles local hosts', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('localhost:5173'), 'http://localhost:5173/');
  assert.equal(normalizeUrl('127.0.0.1:8080/app'), 'http://127.0.0.1:8080/app');
  assert.equal(normalizeUrl('https://example.com/a?b=1#c'), 'https://example.com/a?b=1#c');
});

test('normalizeUrl rejects non-http and credentials', () => {
  assert.throws(() => normalizeUrl('file:///etc/passwd'), /http/i);
  assert.throws(() => normalizeUrl('about:blank'), /http/i);
  assert.throws(() => normalizeUrl('https://user:pass@example.com'), /credentials/i);
  assert.throws(() => normalizeUrl(''), /required/i);
});

test('detectEvalMode distinguishes expressions, await expressions, and statements', () => {
  assert.equal(detectEvalMode('document.title'), 'expression');
  assert.equal(detectEvalMode('await fetch("/")'), 'await-expression');
  assert.equal(detectEvalMode('const x = 1; return x;'), 'statement');
  assert.equal(detectEvalMode(''), 'statement');
});

test('clamp keeps values inside the range', () => {
  assert.equal(clamp(5, 1, 10, 0), 5);
  assert.equal(clamp(20, 1, 10, 0), 10);
  assert.equal(clamp('nope', 1, 10, 3), 3);
});

test('textValue serializes objects and truncates long output', () => {
  assert.equal(textValue({ a: 1 }), '{\n  "a": 1\n}');
  assert.match(textValue('x'.repeat(50_000)), /truncated/);
});
