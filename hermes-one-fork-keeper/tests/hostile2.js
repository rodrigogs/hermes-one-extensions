// Hostile-payload suite for the Fork Keeper panel.
//
// The panel ships as an iframe srcdoc: the render code lives inside a template
// literal and only runs in the iframe. So this extracts the inner <script>,
// evaluates it against a minimal DOM built from the panel's own markup, and calls
// render() directly with payloads the bridge can genuinely produce.
//
// Why this matters: the panel is operator-facing truth about a repo. A crash
// mid-render leaves a half-drawn panel that still looks authoritative, and the
// bridge forwards whatever the CLI writes — so a CLI change, a partial write, or
// an error path arrives here verbatim.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { test } = require('node:test');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fork-keeper-nav.js'), 'utf8');
const start = SRC.indexOf('<!DOCTYPE html>');
const end = SRC.indexOf('</body></html>', start);
const MARKUP = SRC.slice(start, end);
const INNER = MARKUP.slice(MARKUP.indexOf('<script>') + 8, MARKUP.lastIndexOf('</script>'));

// Ids the inner script reaches for, harvested from the markup itself so the
// harness cannot drift from the panel.
const IDS = [...new Set([...MARKUP.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]))];

class El {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = []; this.parentNode = null;
    this._text = ''; this._html = '';
    this.id = ''; this.className = ''; this.hidden = false; this.disabled = false;
    this.style = {}; this.dataset = {}; this.value = '';
    this._cls = new Set(); this._attrs = {}; this._on = {};
    this.classList = {
      add: (...c) => c.filter(Boolean).forEach(x => this._cls.add(x)),
      remove: (...c) => c.filter(Boolean).forEach(x => this._cls.delete(x)),
      contains: c => this._cls.has(c),
      toggle: (c, f) => (f ? this._cls.add(c) : this._cls.delete(c)),
    };
  }
  get textContent() {
    return this.children.length ? this.children.map(c => c.textContent).join('') : this._text;
  }
  set textContent(v) { this._text = String(v == null ? '' : v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v == null ? '' : v); if (!v) this.children = []; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach(c => (typeof c === 'string' ? this.appendChild(Object.assign(new El('span'), { _text: c })) : this.appendChild(c))); }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(ev, fn) { (this._on[ev] = this._on[ev] || []).push(fn); }
  get firstChild() { return this.children[0] || null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() {} scrollIntoView() {}
}

function env(payload, { status = 200, overview } = {}) {
  const nodes = {};
  for (const id of IDS) { nodes[id] = new El('div'); nodes[id].id = id; }
  const body = new El('body');
  Object.values(nodes).forEach(n => body.appendChild(n));

  const doc = {
    body,
    getElementById: id => nodes[id] || null,
    createElement: t => new El(t),
    createDocumentFragment: () => new El('fragment'),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    readyState: 'complete',
  };
  const win = {
    document: doc, parent: {}, location: { href: 'http://x/' },
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: () => 0, clearInterval: () => {},
    addEventListener: () => {},
    fetch: async (url) => ({
      ok: status >= 200 && status < 300, status,
      json: async () => (String(url).includes('overview') ? (overview ?? payload) : payload),
      text: async () => JSON.stringify(payload),
      headers: { get: () => 'application/json' },
    }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
  };
  win.window = win; win.parent = win;
  return { win, doc, body, nodes };
}

// Evaluate the inner script and hand back the functions it defines.
function load(e) {
  const fn = new Function('window', 'document', 'fetch', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'AbortController',
    INNER + '\n;return {render: typeof render === "function" ? render : null,' +
            ' setPill: typeof setPill === "function" ? setPill : null,' +
            ' reload: typeof reload === "function" ? reload : null};');
  return fn(e.win, e.doc, e.win.fetch, e.win.setTimeout, e.win.clearTimeout,
            e.win.setInterval, e.win.clearInterval, e.win.AbortController);
}

test('the inner script evaluates and exposes render()', () => {
  const e = env({ behind: 0 });
  const api = load(e);
  assert.ok(api.render, 'render() is not defined in the panel script');
});

const HOSTILE = [
  ['null', null],
  ['undefined', undefined],
  ['empty object', {}],
  ['error payload', { error: 'sync_fork failed: fatal: not a git repository' }],
  ['behind as a string', { behind: '18', ahead: '0', diverged: false }],
  ['negative counts', { behind: -1, ahead: -5 }],
  ['huge counts', { behind: 999999999, ahead: 12345678 }],
  ['nulls throughout', { behind: null, ahead: null, diverged: true, branch: null, upstream: null, last_sync: null }],
  ['conflicted is a string', { behind: 2, conflicted: 'docs/a.md' }],
  ['conflicted odd paths', { behind: 1, conflicted: ['docs/my notes.md', 'a\nb', '../../etc/passwd'] }],
  ['wrong types everywhere', { behind: {}, ahead: [], diverged: 'yes', conflicted: 7 }],
  ['deeply nested junk', { behind: 1, jobs: { sync: { next: {} } }, history: 'nope' }],
  ['array instead of object', [1, 2, 3]],
  ['a bare string', 'not json at all'],
];

for (const [label, payload] of HOSTILE) {
  test(`render() survives: ${label}`, () => {
    const e = env(payload);
    const api = load(e);
    if (!api.render) return;
    assert.doesNotThrow(() => api.render({ status: payload }),
      `render() threw on ${label} — a half-drawn panel still looks authoritative`);
  });
}

test('an error payload reaches the operator instead of rendering as normal state', () => {
  const e = env({ error: 'sync_fork failed: fatal: not a git repository' });
  const api = load(e);
  if (!api.render) return;
  api.render({ status: { error: 'sync_fork failed: fatal: not a git repository' } });
  const text = e.body.textContent;
  assert.ok(/not a git repository|unavailable|error|failed/i.test(text),
    `nothing about the error was rendered. Panel text: ${JSON.stringify(text.slice(0, 240))}`);
});

test('a conflicted path is never written as markup', () => {
  const e = env({ behind: 1, conflicted: ['<script>alert(1)</script>'] });
  const api = load(e);
  if (!api.render) return;
  api.render({ status: { behind: 1, conflicted: ['<script>alert(1)</script>'] } });
  const walk = (n, hit = []) => {
    if (String(n._html).includes('<script>')) hit.push(n.id || n.tagName);
    n.children.forEach(c => walk(c, hit));
    return hit;
  };
  assert.deepEqual(walk(e.body), [],
    'a conflicted path reached innerHTML; it must be set through textContent');
});
