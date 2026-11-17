/** Page-side helpers executed through the Chrome DevTools Protocol. */

export const PAGE_PRELUDE = `
      const __dshbEsc = (value) => (window.CSS && CSS.escape) ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\\\' + c);
      const __dshbPath = (el) => {
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node !== document.documentElement) {
          if (node.id) { parts.unshift('#' + __dshbEsc(node.id)); break; }
          let part = node.tagName.toLowerCase();
          const parent = node.parentElement;
          if (parent) {
            const same = Array.prototype.filter.call(parent.children, (child) => child.tagName === node.tagName);
            if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
          }
          parts.unshift(part);
          node = node.parentElement;
        }
        return parts.length ? parts.join(' > ') : 'html';
      };
      const __dshbVisible = (el) => {
        try {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
        } catch (error) { return false; }
      };
      const __dshbRect = (el) => {
        try { const rect = el.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }; }
        catch (error) { return null; }
      };
      const __dshbText = (el) => String((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim();
      const __dshbName = (el) => {
        const aria = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '';
        if (aria.trim()) return aria.trim().slice(0, 160);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
          return String(el.getAttribute('placeholder') || el.value || el.name || '').trim().slice(0, 160);
        }
        return __dshbText(el).slice(0, 160);
      };
    `;

export function pageCall(fn, args) {
      const encoded = args.map((value) => (value === undefined ? 'undefined' : JSON.stringify(value))).join(', ');
      return `(() => {${PAGE_PRELUDE}\nreturn (${fn.toString()})(${encoded});\n})()`;
    }

export function pageSnapshot(mode, depth, maxChars) {
      const base = {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 },
        scroll: {
          x: Math.round(scrollX),
          y: Math.round(scrollY),
          maxY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        },
      };
      if (mode === 'html') {
        return Object.assign({}, base, { html: (document.documentElement.outerHTML || '').slice(0, maxChars) });
      }
      if (mode === 'text') {
        return Object.assign({}, base, { text: ((document.body && document.body.innerText) || '').slice(0, maxChars) });
      }
      const interactive = [];
      const controls = document.querySelectorAll('a[href],button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],[contenteditable="true"],[onclick]');
      for (let i = 0; i < controls.length && interactive.length < 160; i += 1) {
        const el = controls[i];
        if (!__dshbVisible(el)) continue;
        const tag = el.tagName.toLowerCase();
        let role = el.getAttribute('role') || '';
        if (!role) {
          if (tag === 'a') role = 'link';
          else if (tag === 'button') role = 'button';
          else if (tag === 'input') role = el.type || 'textbox';
          else if (tag === 'textarea') role = 'textbox';
          else if (tag === 'select') role = 'combobox';
        }
        const item = {
          tag,
          role,
          name: __dshbName(el),
          selector: __dshbPath(el),
          rect: __dshbRect(el),
        };
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
          item.type = el.type || tag;
          item.value = String(el.value || '').slice(0, 200);
          item.placeholder = String(el.getAttribute('placeholder') || '').slice(0, 120);
          item.disabled = el.disabled === true;
        }
        if (tag === 'a') item.href = String(el.href || '').slice(0, 1000);
        interactive.push(item);
      }
      const headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4')).slice(0, 40).map((el) => ({
        level: Number(el.tagName.slice(1)),
        text: __dshbText(el).slice(0, 300),
        selector: __dshbPath(el),
      }));
      const links = Array.prototype.slice.call(document.querySelectorAll('a[href]')).slice(0, 100).map((el) => ({
        text: __dshbText(el).slice(0, 200),
        href: String(el.href || '').slice(0, 1000),
        selector: __dshbPath(el),
      }));
      const forms = Array.prototype.slice.call(document.querySelectorAll('form')).slice(0, 20).map((form) => ({
        selector: __dshbPath(form),
        action: String(form.action || '').slice(0, 1000),
        method: String(form.method || 'get').toUpperCase(),
        fields: Array.prototype.slice.call(form.querySelectorAll('input,textarea,select')).slice(0, 30).map((el) => ({
          name: el.name || '',
          type: el.type || el.tagName.toLowerCase(),
          selector: __dshbPath(el),
          placeholder: String(el.getAttribute('placeholder') || '').slice(0, 120),
        })),
      }));
      let dom;
      if (mode === 'dom') {
        let count = 0;
        const walk = (el, level) => {
          if (!el || el.nodeType !== 1 || count > 1400 || level > depth) return null;
          count += 1;
          const node = { tag: el.tagName.toLowerCase(), selector: __dshbPath(el) };
          if (el.id) node.id = String(el.id).slice(0, 120);
          const className = String(el.getAttribute('class') || '').trim();
          if (className) node.class = className.slice(0, 160);
          if (!el.children.length) {
            const text = __dshbText(el).slice(0, 140);
            if (text) node.text = text;
          }
          const children = [];
          for (let i = 0; i < el.children.length && children.length < 40; i += 1) {
            const child = walk(el.children[i], level + 1);
            if (child) children.push(child);
          }
          if (children.length) node.children = children;
          return node;
        };
        dom = walk(document.body, 0);
      }
      return Object.assign({}, base, {
        textPreview: ((document.body && document.body.innerText) || '').slice(0, 2400),
        interactive,
        headings,
        links,
        forms,
        dom,
      });
    }

export function pageClick(selector, text, index) {
      let candidates = [];
      if (selector) candidates = Array.prototype.slice.call(document.querySelectorAll(selector));
      else if (text) {
        const all = Array.prototype.slice.call(document.querySelectorAll('a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[contenteditable="true"],[onclick]'));
        candidates = all.filter((el) => {
          const haystack = [__dshbText(el), el.value, el.getAttribute('aria-label'), el.getAttribute('title')].filter(Boolean).join(' ').toLowerCase();
          return haystack.indexOf(String(text).toLowerCase()) >= 0;
        });
      }
      const target = candidates[index || 0];
      if (!target) {
        return {
          ok: false,
          error: selector ? `No element matches selector: ${selector}` : `No element matches text: ${text}`,
          matches: candidates.length,
        };
      }
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      try { target.focus({ preventScroll: true }); } catch (error) { /* focus may be blocked */ }
      const info = {
        ok: true,
        tag: target.tagName.toLowerCase(),
        name: __dshbName(target),
        selector: __dshbPath(target),
        rect: __dshbRect(target),
        matches: candidates.length,
        href: target.href ? String(target.href).slice(0, 1000) : undefined,
      };
      target.click();
      return info;
    }

export function pageType(selector, text) {
      const el = selector ? document.querySelector(selector) : null;
      if (!el) return { ok: false, error: `No element matches selector: ${selector}` };
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      try { el.focus({ preventScroll: true }); } catch (error) { /* focus may be blocked */ }
      const value = String(text == null ? '' : text);
      if (el.isContentEditable) {
        el.textContent = value;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
      } else {
        const proto = el.tagName === 'TEXTAREA'
          ? HTMLTextAreaElement.prototype
          : el.tagName === 'SELECT'
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) descriptor.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      let submitted = false;
      if (el.form && typeof el.form.requestSubmit === 'function') {
        // The caller decides whether Enter should submit; report the form only.
        submitted = false;
      }
      return {
        ok: true,
        tag: el.tagName.toLowerCase(),
        selector: __dshbPath(el),
        value: String(el.value == null ? el.textContent : el.value).slice(0, 300),
        form: Boolean(el.form),
        submitted,
      };
    }

export function pageExtract(selector, fields, limit) {
      const items = selector
        ? Array.prototype.slice.call(document.querySelectorAll(selector))
        : Array.prototype.slice.call((document.body && document.body.children) || []);
      const pick = (item, spec) => {
        if (spec == null || spec === '' || spec === 'text') return __dshbText(item);
        const rule = String(spec);
        if (rule === 'html') return String(item.innerHTML || '').slice(0, 3000);
        const at = rule.lastIndexOf('@');
        let targetSelector = at > 0 ? rule.slice(0, at) : rule;
        const attribute = at > 0 ? rule.slice(at + 1) : '';
        if (!targetSelector || targetSelector === 'self') targetSelector = ':scope';
        const target = targetSelector === ':scope' ? item : item.querySelector(targetSelector);
        if (!target) return null;
        if (attribute) return target.getAttribute(attribute);
        return __dshbText(target);
      };
      const rows = [];
      const max = Math.max(1, limit || 50);
      for (let i = 0; i < items.length && rows.length < max; i += 1) {
        const item = items[i];
        const row = {};
        if (fields && typeof fields === 'object') {
          const names = Object.keys(fields);
          for (let n = 0; n < names.length; n += 1) row[names[n]] = pick(item, fields[names[n]]);
        } else {
          row.text = __dshbText(item).slice(0, 3000);
        }
        rows.push(row);
      }
      return { count: items.length, returned: rows.length, rows };
    }

export function pageInspect(selector) {
      const el = document.querySelector(selector);
      if (!el) return { found: false, error: `No element matches selector: ${selector}` };
      const computed = getComputedStyle(el);
      const wanted = ['display', 'position', 'width', 'height', 'color', 'background-color', 'font-size', 'font-weight', 'line-height', 'margin', 'padding', 'border', 'z-index', 'opacity', 'overflow', 'flex', 'grid-template-columns'];
      const styles = {};
      for (let i = 0; i < wanted.length; i += 1) styles[wanted[i]] = computed.getPropertyValue(wanted[i]);
      const attributes = {};
      for (let i = 0; i < el.attributes.length && i < 30; i += 1) attributes[el.attributes[i].name] = String(el.attributes[i].value).slice(0, 300);
      const ancestors = [];
      let parent = el.parentElement;
      while (parent && ancestors.length < 6) {
        ancestors.push({ tag: parent.tagName.toLowerCase(), id: parent.id || '', class: String(parent.getAttribute('class') || '').slice(0, 120), selector: __dshbPath(parent) });
        parent = parent.parentElement;
      }
      const children = Array.prototype.slice.call(el.children).slice(0, 20).map((child) => ({
        tag: child.tagName.toLowerCase(),
        id: child.id || '',
        class: String(child.getAttribute('class') || '').slice(0, 120),
        selector: __dshbPath(child),
      }));
      return {
        found: true,
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        class: String(el.getAttribute('class') || '').slice(0, 300),
        selector: __dshbPath(el),
        text: __dshbText(el).slice(0, 3000),
        html: String(el.outerHTML || '').slice(0, 3000),
        attributes,
        rect: __dshbRect(el),
        styles,
        ancestors,
        children,
      };
    }

export function pageStorage(area, mode, key, value) {
      const read = (store) => {
        const out = {};
        try {
          for (let i = 0; i < store.length; i += 1) {
            const name = store.key(i);
            out[name] = String(store.getItem(name)).slice(0, 4000);
          }
        } catch (error) { /* storage may be blocked */ }
        return out;
      };
      const cookies = () => {
        const out = {};
        String(document.cookie || '').split(';').forEach((part) => {
          const at = part.indexOf('=');
          if (at < 0) return;
          out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
        });
        return out;
      };
      if (mode === 'set' && key) {
        if (area === 'cookies') document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value == null ? '' : value)}; path=/`;
        else (area === 'session' ? sessionStorage : localStorage).setItem(key, value == null ? '' : value);
      }
      if (mode === 'clear') {
        if (area === 'cookies' || area === 'all') {
          Object.keys(cookies()).forEach((name) => { document.cookie = `${name}=; Max-Age=0; path=/`; });
        }
        if (area === 'local' || area === 'all') localStorage.clear();
        if (area === 'session' || area === 'all') sessionStorage.clear();
      }
      const result = {};
      if (area === 'local' || area === 'all') result.local = read(localStorage);
      if (area === 'session' || area === 'all') result.session = read(sessionStorage);
      if (area === 'cookies' || area === 'all') result.cookies = cookies();
      return result;
    }

export function pageNetworkHook() {
      if (window.__DSHB_NET__) return { installed: true, entries: window.__DSHB_NET__.entries.length };
      const store = { entries: [], seq: 0 };
      window.__DSHB_NET__ = store;
      const push = (record) => {
        record.id = ++store.seq;
        store.entries.push(record);
        if (store.entries.length > 300) store.entries.shift();
      };
      const originalFetch = window.fetch;
      if (typeof originalFetch === 'function') {
        window.fetch = function (input, init) {
          const url = typeof input === 'string' ? input : (input && input.url) || '';
          const method = (init && init.method) || (input && input.method) || 'GET';
          const record = { kind: 'fetch', method: String(method).toUpperCase(), url: String(url).slice(0, 2000), started: Date.now() };
          const started = performance.now();
          push(record);
          return originalFetch.apply(this, arguments).then(
            (response) => {
              record.status = response.status;
              record.ok = response.ok;
              record.ms = Math.round(performance.now() - started);
              try {
                response.clone().text().then((body) => {
                  record.body = body.slice(0, 4000);
                  record.size = body.length;
                }).catch(() => {});
              } catch (error) { /* body may be unreadable */ }
              return response;
            },
            (error) => {
              record.error = String(error);
              record.ms = Math.round(performance.now() - started);
              throw error;
            },
          );
        };
      }
      const XHR = window.XMLHttpRequest;
      if (XHR && XHR.prototype) {
        const originalOpen = XHR.prototype.open;
        const originalSend = XHR.prototype.send;
        XHR.prototype.open = function (method, url) {
          this.__dshb = { kind: 'xhr', method: String(method).toUpperCase(), url: String(url).slice(0, 2000), started: Date.now() };
          return originalOpen.apply(this, arguments);
        };
        XHR.prototype.send = function () {
          const record = this.__dshb;
          if (record) {
            push(record);
            const started = performance.now();
            this.addEventListener('loadend', () => {
              record.status = this.status;
              record.ms = Math.round(performance.now() - started);
              try {
                record.body = String(this.responseText || '').slice(0, 4000);
                record.size = String(this.responseText || '').length;
              } catch (error) { /* response may be binary */ }
            }, { once: true });
          }
          return originalSend.apply(this, arguments);
        };
      }
      return { installed: true, entries: 0 };
    }

export function pageNetwork(clear, limit) {
      const store = window.__DSHB_NET__;
      if (!store) return { installed: false, entries: [] };
      const entries = store.entries.slice(-Math.max(1, limit || 50)).map((entry) => Object.assign({}, entry));
      if (clear) store.entries.length = 0;
      return { installed: true, entries };
    }

export function pagePerformance(limit) {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource').slice(-Math.max(1, limit || 100)).map((entry) => ({
        name: String(entry.name).slice(0, 1000),
        type: entry.initiatorType,
        duration: Math.round(entry.duration),
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
      }));
      let memory = null;
      try {
        if (performance.memory) {
          memory = {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          };
        }
      } catch (error) { /* not exposed */ }
      return {
        url: location.href,
        navigation: navigation ? {
          type: navigation.type,
          domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
          load: Math.round(navigation.loadEventEnd),
          transferSize: navigation.transferSize,
        } : null,
        resources,
        memory,
        timing: {
          now: Math.round(performance.now()),
          timeOrigin: performance.timeOrigin,
        },
      };
    }

export function pageWait(selector, text) {
      if (selector) return { found: Boolean(document.querySelector(selector)), kind: 'selector' };
      if (text) return { found: String((document.body && document.body.innerText) || '').includes(String(text)), kind: 'text' };
      return { found: true, kind: 'none' };
    }

export const SERIALIZER = `
      const __dshbSer = (value, depth) => {
        depth = depth || 0;
        if (value === undefined) return { __type: 'undefined' };
        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'bigint') return String(value) + 'n';
        if (typeof value === 'function') return '[Function ' + (value.name || 'anonymous') + ']';
        if (typeof value === 'symbol') return String(value);
        try { if (typeof Node !== 'undefined' && value instanceof Node) return { __type: 'node', tag: value.nodeName, id: value.id || '', text: String(value.textContent || '').slice(0, 400) }; } catch (error) { /* cross-realm */ }
        try { if (value === window) return '[Window]'; if (value === document) return '[Document]'; } catch (error) { /* cross-realm */ }
        if (depth > 4) return Array.isArray(value) ? '[Array(' + value.length + ')]' : '[Object]';
        if (Array.isArray(value)) {
          const out = value.slice(0, 200).map((item) => __dshbSer(item, depth + 1));
          if (value.length > 200) out.push('鈥?' + (value.length - 200) + ' more');
          return out;
        }
        try {
          const out = {};
          let count = 0;
          for (const key of Object.keys(value)) {
            if (count >= 120) { out.__truncated = true; break; }
            count += 1;
            try { out[key] = __dshbSer(value[key], depth + 1); } catch (error) { out[key] = '[unserializable]'; }
          }
          return out;
        } catch (error) { return String(value); }
      };
    `;

export function evalCode(code, mode) {
      let value;
      if (mode === 'expression') value = `await (${code}\n)`;
      else if (mode === 'await-expression') value = `await (async () => (${code}\n))()`;
      else value = `await (async () => {${code}\n})()`;
      return `(async () => {${SERIALIZER}\ntry { const __dshbValue = ${value}; return { ok: true, value: __dshbSer(__dshbValue, 0) }; }\ncatch (__dshbError) { return { ok: false, error: String(__dshbError && __dshbError.stack || __dshbError) }; }\n})()`;
    }


