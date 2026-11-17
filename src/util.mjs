/** Small cross-adapter helpers. */

export function clamp(value, low, high, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(low, Math.min(high, Math.trunc(number)));
}

export function normalizeUrl(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) throw new Error('A URL is required');
  let withScheme = raw;
  if (!/^https?:\/\//i.test(raw)) {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
    if (scheme && !/^[a-z][a-z0-9+.-]*:\d+(\/|$)/i.test(raw)) {
      throw new Error('Only http and https URLs are supported');
    }
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(raw);
    withScheme = `${local ? 'http' : 'https'}://${raw}`;
  }
  const url = new URL(withScheme);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs are supported');
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not supported');
  return url.href;
}

export function detectEvalMode(code) {
  const source = String(code ?? '').trim();
  if (source === '') return 'statement';
  try {
    // eslint-disable-next-line no-new-func
    new Function(`return (${source}\n)`);
    return 'expression';
  } catch {
    /* not a plain expression */
  }
  try {
    // eslint-disable-next-line no-new-func
    new Function(`return (async () => (${source}\n))()`);
    return 'await-expression';
  } catch {
    return 'statement';
  }
}

export function textValue(value) {
  let text;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (typeof text !== 'string') text = String(text);
  if (text.length > 40_000) text = `${text.slice(0, 40_000)}\n… (truncated)`;
  return text;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
