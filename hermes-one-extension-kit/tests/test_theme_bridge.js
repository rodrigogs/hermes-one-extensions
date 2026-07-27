// The theme bridge, which decides what colour all three panels are.
//
// This file exists because the failure it guards against is invisible in the skin
// we develop in. The host has 21 skins x light/dark; our panels used to hard-code
// a near-black palette, and in default/dark that looked deliberate. It was only in
// default/light — parchment #FEFCF7 on ink — that the panels became a black
// rectangle inside the shell. A screenshot in one skin cannot catch that, so the
// behaviour is pinned here instead:
//
//   1. the host's live tokens reach a panel document at all;
//   2. a skin change re-syncs them, through the host's own appliers;
//   3. a panel that was mounted BEFORE the bridge ran still ends up themed;
//   4. a frame that RELOADS (a srcdoc console re-rendered by its sidecar) is
//      re-themed, because it comes back with a brand new documentElement;
//   5. an unreadable or hostile host value leaves the stylesheet's legible
//      fallback standing rather than producing an unstyled panel;
//   6. the two stylesheets that carry the derivation stay byte-identical apart
//      from their scoping selector.
//
// The DOM stub is hand-written, in the same style as test_panel_nav.js: it answers
// only the questions the module actually asks, because a fake that silently
// answers everything is how a test passes while the code is broken.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const HERE = __dirname;
// The subject sits one level up from tests/, and BOTH layouts exist: the source
// checkout keeps them side by side, the deployed extension keeps tests/ inside the
// extension directory. Search rather than assume — resolving against __dirname
// alone passed for whoever ran it from the parent and was 31/48 red on the box.
const SOURCE_CANDIDATES = [
  path.join(HERE, '..', 'hermes-theme-bridge.js'),   // deployed: hermes-panel/tests -> hermes-panel
  path.join(HERE, 'hermes-theme-bridge.js'),         // side by side
];
const sourcePath = SOURCE_CANDIDATES.find((p) => fs.existsSync(p)) || SOURCE_CANDIDATES[0];
// Same search as the subject and the office sheet above: the deployed layout puts
// tests/ inside the extension directory, the checkout puts them side by side.
const PANEL_CSS_CANDIDATES = [
  path.join(HERE, '..', 'hermes-panel.css'),
  path.join(HERE, 'hermes-panel.css'),
];
const panelCssPath = PANEL_CSS_CANDIDATES.find((p) => fs.existsSync(p)) || PANEL_CSS_CANDIDATES[0];

/* The office copy does not live beside this test once deployed.
 *
 * The two stylesheets ship to DIFFERENT trees — hermes-panel.css to the extension
 * directory, office-panel-tokens.css into the office app's src/ so Vite can bundle
 * it — and this test travels with the extension. Looked at only where it lives, the
 * sync check silently passed on the box while checking nothing, which is the
 * failure mode the check exists to prevent. So the candidates are searched, and
 * finding NONE is a failure rather than a skip. */
const OFFICE_CANDIDATES = [
  path.join(HERE, '..', 'office-panel-tokens.css'),                    // deployed: tests/ -> extension dir
  path.join(HERE, 'office-panel-tokens.css'),                          // the source checkout
  '/home/rodrigo/hermes-office-web/src/office-panel-tokens.css',       // the deploy target
];
const officeCssPath = OFFICE_CANDIDATES.find((p) => fs.existsSync(p)) || null;

const source = () => fs.readFileSync(sourcePath, 'utf8');

// The shell's real resolved tokens, read live from the running host with
// getComputedStyle(document.documentElement). Two skins, opposite polarities, so
// "it works" cannot mean "it works in the dark".
const DEFAULT_DARK = {
  '--bg': '#0D0D1A', '--surface': '#1A1A2E', '--sidebar': '#141425',
  '--surface-subtle': 'rgba(255,255,255,.025)', '--hover-bg': 'rgba(255,255,255,.06)',
  '--input-bg': 'rgba(255,255,255,.04)', '--code-bg': '#1A1A2E',
  '--border': '#2A2A45', '--border2': 'rgba(255,255,255,0.14)',
  '--border-subtle': 'color-mix(in srgb, #2A2A45 60%, transparent)',
  '--border-muted': 'rgba(255,255,255,.12)',
  '--text': '#FFF8DC', '--strong': '#fff', '--muted': '#C0C0C0', '--code-text': '#f0c27f',
  '--accent': '#FFD700', '--accent-hover': '#FFBF00', '--accent-text': '#FFD700',
  '--accent-bg': 'rgba(255,215,0,0.08)', '--accent-bg-strong': 'rgba(255,215,0,0.15)',
  '--panel-head-primary-fg': '#0D0D1A', '--focus-ring': 'rgba(255,215,0,.35)',
  '--success': '#4CAF50', '--warning': '#FFA726', '--error': '#EF5350', '--info': '#4DD0E1',
  '--font-ui': '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif',
  '--font-mono': '',                       // measured: unset in this skin
  '--font-size-xs': '11px', '--font-size-sm': '12px', '--font-size-md': '14px',
  '--radius-sm': '4px', '--radius-md': '8px', '--radius-lg': '12px', '--radius-pill': '999px',
};

// catppuccin/light, measured live. Note --panel-head-primary-fg is EMPTY here, as
// it is in every light skin sampled — the case that must remove, not blank.
const CATPPUCCIN_LIGHT = {
  ...DEFAULT_DARK,
  '--bg': '#EFF1F5', '--surface': '#FFFFFF', '--sidebar': '#E6E9EF',
  '--border': '#CCD0DA', '--border2': '#BCC0CC',
  '--text': '#4C4F69', '--strong': '#1E1E2E', '--muted': '#7C7F93',
  '--accent': '#8839EF', '--accent-hover': '#6C26D6', '--accent-text': '#8839EF',
  '--accent-bg': 'rgba(136,57,239,0.09)', '--accent-bg-strong': 'rgba(136,57,239,0.18)',
  '--panel-head-primary-fg': '',
  '--focus-ring': 'rgba(136,57,239,0.3)',
  '--success': '#3D8B40', '--warning': '#E68A00', '--error': '#C62828', '--info': '#0288A8',
};

// A document element whose inline custom properties can be read back, which is
// the whole observable effect of this module.
function makeDoc({ tokens, dark = true, rootFont = '14px' } = {}) {
  const props = new Map();
  const classes = new Set(dark ? ['dark'] : []);
  const doc = {
    _props: props,
    _classes: classes,
    _tokens: tokens,
    _rootFont: rootFont,
    documentElement: {
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      style: {
        setProperty: (name, value) => props.set(name, value),
        removeProperty: (name) => props.delete(name),
        getPropertyValue: (name) => props.get(name) ?? '',
      },
      dataset: {},
    },
    createElement: () => ({ style: {}, setAttribute() {}, append() {} }),
    querySelectorAll: () => doc._frames || [],
    addEventListener(type, fn) { (doc._on ||= {})[type] = fn; },
    readyState: 'complete',
  };
  return doc;
}

// A same-origin frame. `reachable:false` models the cross-origin / not-yet-
// navigated case the module has to survive without stopping the other frames.
function makeFrame({ reachable = true, connected = true, tokens = null } = {}) {
  const inner = reachable ? makeDoc({ tokens: tokens || {} }) : null;
  const frame = {
    tagName: 'IFRAME',
    nodeType: 1,          // the childList path checks this before touching the node
    isConnected: connected,
    get contentDocument() {
      if (frame._blocked) throw new Error('SecurityError: cross-origin');
      return frame._doc;
    },
    _doc: inner,
    _blocked: false,
    addEventListener(type, fn) { (frame._on ||= {})[type] = fn; },
    fireLoad() { frame._on?.load?.(); },
    props: () => (frame._doc ? frame._doc._props : new Map()),
  };
  return frame;
}

/* Load the bridge into a fake host page.
 *
 * `appliers` mirrors the real shell: _applyTheme / _applySkin / _setResolvedTheme
 * are plain window globals (verified live: all three typeof 'function'), and they
 * are what actually mutates <html>. The stub versions swap the token table, which
 * is what a real skin change does to the resolved values. */
function loadHost({
  tokens = DEFAULT_DARK,
  dark = true,
  rootFont = '14px',
  frames = [],
  withAppliers = true,
  withCssSupports = true,
  observers = true,
} = {}) {
  const state = { tokens, dark, rootFont };
  const doc = makeDoc({ tokens, dark, rootFont });
  doc._frames = frames;

  const seen = [];
  const window = {
    getComputedStyle: (el) => {
      if (el !== doc.documentElement) return null;
      return {
        getPropertyValue: (name) => {
          seen.push(name);
          const table = state.tokens;
          return Object.prototype.hasOwnProperty.call(table, name) ? table[name] : '';
        },
        fontSize: state.rootFont,
      };
    },
    addEventListener(type, fn) { (window._on ||= {})[type] = fn; },
  };
  if (withCssSupports) {
    // The real CSS.supports, near enough: it is used only as a type check, and
    // the shapes that matter are the ones the host actually ships.
    window.CSS = {
      supports: (prop, value) => {
        const v = String(value).trim();
        if (!v) return false;
        if (prop === 'font-family') return true;
        if (prop === 'font-size') return /^-?[\d.]+(px|em|rem|%|pt|vh|vw)$/.test(v) || /^calc\(|^clamp\(/.test(v);
        // colour: hex, rgb/hsl, color-mix, a CSS keyword, or a bare word that is
        // NOT a known keyword (which must be rejected — that is the fail-safe).
        if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return true;
        if (/^(rgb|rgba|hsl|hsla|color-mix|color|oklch|lab)\(/i.test(v)) return true;
        return ['transparent', 'currentcolor', 'white', 'black', 'red', 'blue', 'gold', 'inherit'].includes(v.toLowerCase());
      },
    };
  }
  if (observers) {
    window.MutationObserver = class {
      constructor(fn) { this.fn = fn; window._observers = (window._observers || []).concat(this); }
      observe(target, opts) { this.target = target; this.opts = opts; }
      disconnect() { this.stopped = true; }
    };
  }
  window.requestAnimationFrame = (fn) => { (window._raf ||= []).push(fn); return window._raf.length; };
  window.setTimeout = (fn) => { (window._raf ||= []).push(fn); return 0; };

  if (withAppliers) {
    const applied = [];
    window._applyTheme = (name) => { applied.push(['theme', name]); state.dark = name !== 'light'; doc._classes[state.dark ? 'add' : 'delete']('dark'); };
    window._applySkin = (name) => {
      applied.push(['skin', name]);
      state.tokens = name === 'catppuccin' ? CATPPUCCIN_LIGHT : DEFAULT_DARK;
      doc.documentElement.dataset.skin = name;
    };
    window._setResolvedTheme = (isDark) => { applied.push(['resolved', isDark]); };
    window._applied = applied;
  }

  const context = {
    console,
    document: doc,
    window,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: window.requestAnimationFrame,
    setTimeout: window.setTimeout,
  };
  // The module tests `window.parent !== window` to decide host-vs-framed. A host
  // page's window.parent IS itself.
  window.parent = window;
  window.self = window;
  context.globalThis = context;
  vm.runInNewContext(source(), context, { filename: sourcePath });

  const flush = () => { const q = window._raf || []; window._raf = []; q.forEach((fn) => fn()); };
  return { doc, window, state, flush, theme: window.HermesTheme, seen,
           props: () => doc._props };
}

/* Load the bridge INSIDE a panel frame, where the useful act is to pull the
 * parent's tokens synchronously before first paint. */
function loadFramed({ parentTokens = DEFAULT_DARK, dark = true, blocked = false } = {}) {
  const own = makeDoc({ tokens: {} });
  const parentDoc = makeDoc({ tokens: parentTokens, dark });
  const parent = {
    document: parentDoc,
    getComputedStyle: (el) => {
      if (blocked) throw new Error('SecurityError: cross-origin');
      if (el !== parentDoc.documentElement) return null;
      return {
        getPropertyValue: (n) => (Object.prototype.hasOwnProperty.call(parentTokens, n) ? parentTokens[n] : ''),
        fontSize: '14px',
      };
    },
  };
  const window = {
    parent,
    CSS: { supports: () => true },
    addEventListener() {},
    requestAnimationFrame: (fn) => { (window._raf ||= []).push(fn); },
    setTimeout: (fn) => { (window._raf ||= []).push(fn); },
    getComputedStyle: (el) => (el === own.documentElement
      ? { getPropertyValue: () => '', fontSize: '14px' } : null),
  };
  window.self = window;
  const context = {
    console, document: own, window,
    getComputedStyle: window.getComputedStyle,
    requestAnimationFrame: window.requestAnimationFrame,
    setTimeout: window.setTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source(), context, { filename: sourcePath });
  return { doc: own, window, theme: window.HermesTheme, props: () => own._props };
}

// ── 1. the tokens are forwarded at all ──────────────────────────────────────

test('the host\'s live tokens reach the host document under the --host- namespace', () => {
  const h = loadHost();
  const p = h.props();
  // The colours a panel cannot be legible without.
  assert.equal(p.get('--host-bg'), '#0D0D1A');
  assert.equal(p.get('--host-text'), '#FFF8DC');
  assert.equal(p.get('--host-accent'), '#FFD700');
  assert.equal(p.get('--host-border'), '#2A2A45');
  assert.equal(p.get('--host-muted'), '#C0C0C0');
  // The state four, under the host's names — the mapping our CSS reads.
  assert.equal(p.get('--host-success'), '#4CAF50');
  assert.equal(p.get('--host-warning'), '#FFA726');
  assert.equal(p.get('--host-error'), '#EF5350');
  assert.equal(p.get('--host-info'), '#4DD0E1');
  // Nothing is written under the host's OWN names, or the shell would repaint.
  for (const name of ['--bg', '--text', '--accent', '--border']) {
    assert.equal(p.has(name), false, `${name} must never be set — that is the shell's`);
  }
});

test('a value the host does not declare is left UNSET, not blanked', () => {
  // --font-mono is measured empty in 8 of the 9 skins sampled. Setting it to ""
  // is not the same as leaving it unset: var(--x, fallback) would then resolve to
  // nothing instead of to our real mono stack.
  const h = loadHost();
  assert.equal(h.props().has('--host-font-mono'), false);
  assert.equal(h.props().get('--host-font-ui').startsWith('-apple-system'), true);
});

test('color-scheme and root font-size are forwarded, because the host keeps them outside its properties', () => {
  const dark = loadHost({ dark: true });
  assert.equal(dark.props().get('--host-color-scheme'), 'dark');
  const light = loadHost({ dark: false, tokens: CATPPUCCIN_LIGHT, rootFont: '18px' });
  assert.equal(light.props().get('--host-color-scheme'), 'light',
    'a light skin must not get dark scrollbars and a black frame flash');
  assert.equal(light.props().get('--host-root-font'), '18px');
});

test('forwarded() names exactly what apply() writes, so a consumer can assert', () => {
  const h = loadHost();
  const named = new Set(h.theme.forwarded());
  for (const key of h.props().keys()) {
    assert.equal(named.has(key), true, `${key} is written but not declared by forwarded()`);
  }
  assert.equal(named.has('--host-bg'), true);
  assert.equal(named.has('--host-color-scheme'), true);
});

// ── 2. a skin change re-syncs ───────────────────────────────────────────────

test('a skin change through the host\'s own appliers re-syncs every document', () => {
  const frame = makeFrame();
  const h = loadHost({ frames: [frame] });
  assert.equal(frame.props().get('--host-accent'), '#FFD700');
  assert.equal(frame.props().get('--host-color-scheme'), 'dark');

  // Exactly what Settings -> Appearance does: _applyTheme then _applySkin.
  h.window._applyTheme('light');
  h.window._applySkin('catppuccin');
  h.flush();

  assert.equal(h.props().get('--host-bg'), '#EFF1F5', 'the host document must re-sync');
  assert.equal(frame.props().get('--host-bg'), '#EFF1F5', 'the frame must re-sync too');
  assert.equal(frame.props().get('--host-accent'), '#8839EF');
  assert.equal(frame.props().get('--host-color-scheme'), 'light');
  // The host's own applier still ran and still did its job.
  assert.deepEqual(h.window._applied.map((a) => a[0]), ['theme', 'skin']);
});

test('a token the new skin does not declare is REMOVED, restoring the fallback', () => {
  const frame = makeFrame();
  const h = loadHost({ frames: [frame] });
  // default/dark declares it; catppuccin/light does not.
  assert.equal(frame.props().get('--host-accent-fg'), '#0D0D1A');
  h.window._applySkin('catppuccin');
  h.flush();
  assert.equal(frame.props().has('--host-accent-fg'), false,
    'a stale dark background would be painted as text on the accent in a light skin');
});

test('three appliers firing in one task cost one re-read, not three', () => {
  const h = loadHost();
  const before = h.seen.length;
  h.window._applyTheme('light');
  h.window._applySkin('catppuccin');
  h.window._setResolvedTheme(false);
  assert.equal(h.seen.length, before, 'nothing may be read before the frame is scheduled');
  h.flush();
  const reads = h.seen.length - before;
  // One pass over the forward table, not three.
  assert.ok(reads <= h.theme.forwarded().length + 2,
    `coalescing failed: ${reads} property reads for one skin change`);
});

test('the <html> attribute observer is a second path, in case the appliers are renamed', () => {
  const h = loadHost({ withAppliers: false });
  const attr = (h.window._observers || []).find((o) => o.opts && o.opts.attributes);
  assert.ok(attr, 'no attribute observer registered');
  // Spread it: the array is constructed inside the vm realm, so its Array
  // prototype is not this realm's and deepStrictEqual would reject an equal one.
  assert.deepEqual([...attr.opts.attributeFilter], ['class', 'data-skin', 'data-font-size']);
  // A host that renamed _applySkin still repaints our panels.
  h.state.tokens = CATPPUCCIN_LIGHT;
  attr.fn([]);
  h.flush();
  assert.equal(h.props().get('--host-bg'), '#EFF1F5');
});

// ── 3 & 4. ordering: mounted before the bridge, and reloaded after ──────────

test('a panel mounted BEFORE the bridge ran is themed when the bridge starts', () => {
  const early = makeFrame();
  const h = loadHost({ frames: [early] });   // already in the page at load time
  assert.equal(early.props().get('--host-bg'), '#0D0D1A',
    'a panel the operator had already opened must not stay unthemed');
  assert.equal(early.props().get('--host-text'), '#FFF8DC');
});

test('a panel mounted AFTER the bridge is themed when the launcher adopts it', () => {
  const h = loadHost();
  const late = makeFrame();
  h.theme.adopt(late);
  assert.equal(late.props().get('--host-accent'), '#FFD700');
  // And it tracks later skin changes, not just the moment it was adopted.
  h.window._applySkin('catppuccin');
  h.flush();
  assert.equal(late.props().get('--host-accent'), '#8839EF');
});

test('a frame added to the DOM is adopted by the childList observer', () => {
  const h = loadHost();
  const child = makeFrame();
  const tree = (h.window._observers || []).find((o) => o.opts && o.opts.childList);
  assert.ok(tree, 'no childList observer registered');
  tree.fn([{ addedNodes: [child] }]);
  assert.equal(child.props().get('--host-bg'), '#0D0D1A',
    'the three launchers mount lazily, so this is the usual path');
});

test('a frame that RELOADS is re-themed, because it comes back with a new documentElement', () => {
  const frame = makeFrame();
  const h = loadHost({ frames: [frame] });
  assert.equal(frame.props().get('--host-bg'), '#0D0D1A');
  // What a srcdoc console re-rendered by its sidecar actually does.
  frame._doc = makeDoc({ tokens: {} });
  assert.equal(frame.props().has('--host-bg'), false, 'precondition: the new document is bare');
  frame.fireLoad();
  assert.equal(frame.props().get('--host-bg'), '#0D0D1A', 'the reload left the console unthemed');
  assert.equal(frame.props().get('--host-color-scheme'), 'dark');
});

test('a framed document self-themes from its parent, synchronously, at parse time', () => {
  // The office is a src iframe running a built app; the parent's load handler
  // cannot beat its first paint, so the framed copy pulls.
  const f = loadFramed();
  assert.equal(f.props().get('--host-bg'), '#0D0D1A');
  assert.equal(f.props().get('--host-accent'), '#FFD700');
  assert.equal(f.props().get('--host-color-scheme'), 'dark');
  assert.equal(typeof f.theme.pull, 'function');
});

test('a framed document whose parent is unreadable keeps its stylesheet fallbacks', () => {
  const f = loadFramed({ blocked: true });
  assert.equal(f.props().size, 0,
    'writing a partial/garbage set would be worse than leaving the CSS fallbacks');
});

// ── 5. fail safe ────────────────────────────────────────────────────────────

test('an unreadable host leaves the panel on its legible fallbacks rather than unstyled', () => {
  const h = loadHost({ tokens: {} });   // a host that declares nothing we read
  const p = h.props();
  for (const name of h.theme.forwarded()) {
    if (name === '--host-color-scheme' || name === '--host-root-font') continue;
    assert.equal(p.has(name), false, `${name} must be unset so var(--x, fallback) applies`);
  }
  // The one thing it still asserts: a legible DARK default.
  assert.equal(p.get('--host-color-scheme'), 'dark');
});

test('a value that is not a colour is DROPPED, because an invalid one unstyles the panel', () => {
  // The real risk is not injection but garbage: `--bg: var(--host-bg, #0a0a0c)`
  // falls back happily when --host-bg is unset, but if it is set to `notacolor`
  // the declaration is invalid at computed-value time and background reverts to
  // transparent — an unreadable panel.
  const h = loadHost({ tokens: { ...DEFAULT_DARK, '--bg': 'notacolor', '--text': '#FFF8DC' } });
  assert.equal(h.props().has('--host-bg'), false);
  assert.equal(h.props().get('--host-text'), '#FFF8DC', 'one bad value may not poison the rest');
});

test('a value carrying CSS-injection syntax is dropped', () => {
  // A forwarded value is written into CSS in ANOTHER document, so it is data even
  // though it came from the shell. The shell sanitizes tokens registered BY
  // EXTENSIONS (boot.js _sanitizeSkinTokens) but a panel that trusted its parent
  // completely would inherit any future hole in that.
  //
  // Run BOTH with and without CSS.supports. With it, the type check happens to
  // reject these too — no colour contains a semicolon. Without it, the deny-list
  // is the only guard left, so this is where that guard is actually named.
  const hostile = {
    ...DEFAULT_DARK,
    '--surface': '#fff; position:fixed; inset:0',
    '--border': 'url(https://evil.example/x.png)',
    '--accent': '#fff}html{display:none',
    '--muted': '\\3c script',
    '--font-ui': 'Inter; behavior:url(#x)',
  };
  for (const withCssSupports of [true, false]) {
    const h = loadHost({ tokens: hostile, withCssSupports });
    for (const name of ['--host-surface', '--host-border', '--host-accent', '--host-muted', '--host-font-ui']) {
      assert.equal(h.props().has(name), false,
        `${name} was forwarded from a hostile value (CSS.supports=${withCssSupports})`);
    }
    assert.equal(h.props().get('--host-bg'), '#0D0D1A', 'the clean tokens still land');
  }
});

test('an absurdly long value is dropped', () => {
  const h = loadHost({ tokens: { ...DEFAULT_DARK, '--font-ui': `"${'a'.repeat(400)}"` } });
  assert.equal(h.props().has('--host-font-ui'), false);
});

test('a frame that cannot be reached does not stop the frames that can', () => {
  const blocked = makeFrame();
  blocked._blocked = true;                  // contentDocument throws
  const gone = makeFrame({ connected: false });
  const notNavigated = makeFrame({ reachable: false });
  const good = makeFrame();
  const h = loadHost({ frames: [blocked, gone, notNavigated, good] });
  assert.equal(good.props().get('--host-bg'), '#0D0D1A');
  // And a later skin change still reaches the good one.
  h.window._applySkin('catppuccin');
  h.flush();
  assert.equal(good.props().get('--host-bg'), '#EFF1F5');
});

test('a shell with no CSS.supports still gets themed, not blanked', () => {
  // Degrading to "unstyled" on an engine without CSS.supports would be a worse
  // failure than the type check prevents; the injection deny-list still applies.
  const h = loadHost({ withCssSupports: false });
  assert.equal(h.props().get('--host-bg'), '#0D0D1A');
  const hostile = loadHost({ withCssSupports: false, tokens: { ...DEFAULT_DARK, '--bg': '#fff;x:y' } });
  assert.equal(hostile.props().has('--host-bg'), false);
});

test('the bridge never throws, whatever the shell looks like', () => {
  assert.doesNotThrow(() => loadHost({ withAppliers: false, observers: false, tokens: {} }));
});

test('tokens() and token() expose the same values to JS that cannot use CSS', () => {
  // The office 3D scene colours materials in JS; it must not re-read the shell
  // its own way and drift from the CSS.
  const h = loadHost();
  assert.equal(h.theme.tokens()['--host-accent'], '#FFD700');
  assert.equal(h.theme.token('accent'), '#FFD700');
  assert.equal(h.theme.token('--accent'), '#FFD700');
  assert.equal(h.theme.token('--host-accent'), '#FFD700');
  assert.equal(h.theme.token('font-mono', 'monospace'), 'monospace',
    'an undeclared token must yield the caller\'s fallback, not ""');
});

// ── 6. the two stylesheets stay in sync ─────────────────────────────────────

const PREAMBLE = /^\/\*[\s\S]*?\*\/\n/;

test('office-panel-tokens.css is hermes-panel.css with one selector changed', () => {
  const panel = fs.readFileSync(panelCssPath, 'utf8');
  assert.ok(officeCssPath,
    `office-panel-tokens.css not found; looked in:\n  ${OFFICE_CANDIDATES.join('\n  ')}`);
  const office = fs.readFileSync(officeCssPath, 'utf8');
  // The office file is the panel file with its own leading comment prepended
  // (saying why it differs) and the FIRST `.hermes-panel {` widened to
  // `:root,\n.hermes-panel {`. Strip the one, undo the other, and the two must be
  // byte-identical.
  const body = office.replace(PREAMBLE, '');
  assert.match(body, /^\/\* Hermes One panel system/,
    'the office copy must carry the panel stylesheet verbatim after its own header');
  assert.match(body, /\n:root,\n\.hermes-panel \{/,
    'the office copy must declare the tokens at :root as well, for body/#root');
  assert.equal(body.replace(':root,\n.hermes-panel {', '.hermes-panel {'), panel,
    'the two stylesheets have drifted — the office and the consoles now disagree');
  assert.equal((body.match(/^:root,$/gm) || []).length, 1,
    'exactly one :root, and only on the token block');
  // And it is the TOKEN block that was widened, not some later rule: the office's
  // body/#root need the tokens; nothing else about the panel changes.
  const at = body.indexOf(':root,\n.hermes-panel {');
  const block = body.slice(at, body.indexOf('\n}', at));
  assert.match(block, /--bg: var\(--host-bg,/);
  assert.match(block, /--accent: var\(--host-accent,/);
});

test('hermes-panel.css never declares the token block at :root', () => {
  // The host declares --bg/--text on its own :root. Ours at :root meant load
  // order decided the panels' colours and an extension could repaint the shell.
  const panel = fs.readFileSync(panelCssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/(^|\})\s*:root/.test(panel), false, 'the consoles\' copy must stay scoped');
});

test('every colour in both stylesheets is a host token with a fallback, not a palette', () => {
  assert.ok(officeCssPath, "office-panel-tokens.css not found; see OFFICE_CANDIDATES");
  for (const file of [panelCssPath, officeCssPath]) {
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.ok(hexes.length > 0, 'fallbacks are expected to exist');
    // Every hex must sit inside a var(--host-*, ...) fallback slot. A hex that
    // does not is a colour that survives a skin change — the exact bug this
    // whole change removes.
    const naked = [];
    for (const line of css.split('\n')) {
      if (!/#[0-9a-fA-F]{3,8}\b/.test(line)) continue;
      if (/var\(--host-[a-z0-9-]+,/.test(line)) continue;
      naked.push(line.trim());
    }
    assert.deepEqual(naked, [], `${path.basename(file)} has hard-coded colours`);
  }
});

test('a raised plane uses the host\'s own wash, never a mix toward the text colour', () => {
  // MEASURED, all 21 skins x both polarities: mixing --host-surface toward
  // --host-text inverts in catppuccin/light (bg #EFF1F5, surface #FFFFFF) — the
  // "raised" plane moved back toward the background and read as recessed. The
  // host's --surface-subtle / --hover-bg are authored per skin AND per polarity
  // (rgba(255,255,255,.025) dark, rgba(0,0,0,.025) light), so they cannot invert.
  const css = fs.readFileSync(panelCssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /--surface-raised:\s*var\(--host-surface-subtle,/);
  assert.match(css, /--surface-hover:\s*var\(--host-hover-bg,/);
  assert.equal(/--surface-(raised|hover):\s*color-mix/.test(css), false,
    'a neutral plane mixed toward --host-text inverts in a light skin');
});

test('no text token invents contrast the shell does not have', () => {
  // MEASURED: --host-muted against --host-bg bottoms out at 3.47:1
  // (terracotta/light). A third, fainter step mixed from it measured 2.31:1 at
  // 72% and only 3.07:1 at 92% — below the floor for the 11px labels --faint
  // actually carries. So --faint is --host-muted, and the step below it is made in
  // TYPE (11px, uppercase, tracked) rather than in contrast.
  const css = fs.readFileSync(panelCssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /--faint:\s*var\(--host-muted,/);
  assert.equal(/--faint:\s*color-mix/.test(css), false,
    'a derived third text step falls under 3:1 in the measured worst-case skin');
  // The type step that replaces it is real and on the host's ladder.
  assert.match(css, /\.hp-kicker \{[^}]*font:[^;]*var\(--t-label\)[^}]*text-transform: uppercase/s);
});

test('the two genuinely derived tokens are mixed from a STATE colour and are @supports-guarded', () => {
  const css = fs.readFileSync(panelCssPath, 'utf8');
  // A state wash mixes with `transparent`, so it tints whatever plane it lands on
  // and has no polarity to get wrong.
  for (const [name, host] of [['ok', 'success'], ['warn', 'warning'], ['bad', 'error'], ['info', 'info']]) {
    assert.match(css, new RegExp(`--${name}-bg: color-mix\\(in srgb, var\\(--host-${host},[^)]*\\) 14%, transparent\\)`));
  }
  // Danger TYPE: --host-error alone measures 4.01:1 at worst, under the 4.5:1 body
  // floor; pulled 22% toward --host-text the worst case is 5.16:1.
  assert.match(css, /--bad-text: color-mix\(in srgb, var\(--host-error,[^)]*\) 78%, var\(--host-text/);
  // Behind @supports, because a custom property accepts any token stream at parse
  // time — an engine without color-mix would keep the declaration and fail later,
  // at computed-value time, leaving the panel unstyled rather than falling back.
  assert.match(css, /@supports \(color: color-mix\(in srgb, red 50%, blue\)\)/);
  const guarded = css.slice(css.indexOf('@supports (color: color-mix'));
  assert.ok(guarded.includes('--bad-text: color-mix'), '--bad-text must be inside @supports');
  assert.ok(guarded.includes('--ok-bg: color-mix'), '--ok-bg must be inside @supports');
  // And every one has a flat fallback declared BEFORE the guarded block.
  const before = css.slice(0, css.indexOf('@supports (color: color-mix'));
  for (const n of ['--ok-bg', '--warn-bg', '--bad-bg', '--info-bg', '--bad-text']) {
    assert.ok(new RegExp(`${n}:`).test(before), `${n} has no pre-color-mix fallback`);
  }
});

test('the mapping our CSS reads matches the names the bridge forwards', () => {
  // The bridge and the stylesheet are two halves of one contract; a rename on one
  // side is silent breakage on the other.
  const bridge = source();
  const forwarded = new Set();
  for (const m of bridge.matchAll(/\['([a-z0-9-]+)',\s*'([a-z0-9-]+)',\s*(?:COLOR|LEN|FONT)\]/g)) {
    forwarded.add(`--host-${m[2]}`);
  }
  forwarded.add('--host-color-scheme');
  forwarded.add('--host-root-font');
  assert.ok(forwarded.size >= 30, `only parsed ${forwarded.size} forwarded names`);
  const css = fs.readFileSync(panelCssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const used = new Set([...css.matchAll(/var\((--host-[a-z0-9-]+)/g)].map((m) => m[1]));
  assert.ok(used.size > 0);
  for (const name of used) {
    assert.equal(forwarded.has(name), true,
      `${name} is read by the stylesheet but never forwarded by the bridge`);
  }
});

test('the touch and mobile guarantees survive the re-tokenisation', () => {
  assert.ok(officeCssPath, "office-panel-tokens.css not found; see OFFICE_CANDIDATES");
  for (const file of [panelCssPath, officeCssPath]) {
    const css = fs.readFileSync(file, 'utf8');
    assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /font-size:\s*max\(16px, 1em\)/,
      'an input under 16px triggers the iOS focus-zoom trap');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  }
});

test('the wordmark masthead is no longer the panel\'s heading primitive', () => {
  // The brief: no "ROUTER / HERMES ONE" masthead. What replaces it is the host's
  // own .main-view-header shape — measured live at padding 8px 32px with an
  // 18px/600/-0.18px SANS title.
  const css = fs.readFileSync(panelCssPath, 'utf8');
  const head = css.slice(css.indexOf('.hp-head {'), css.indexOf('.hp-head-actions'));
  assert.match(head, /padding:\s*8px clamp\([^)]*32px\)/);
  assert.match(head, /font:\s*600 var\(--t-head\)[^;]*var\(--sans\)/);
  assert.match(head, /letter-spacing:\s*-\.18px/);
  assert.equal(/text-transform:\s*uppercase/.test(head), false,
    'the native header is a title, not a tracked wordmark');
  // And the type scale is the host's ladder, not a parallel one.
  assert.match(css, /--t-label:\s*var\(--host-font-size-xs, 11px\)/);
  assert.match(css, /--t-head:\s*18px/);
  assert.equal(/--t-label:\s*10\.5px/.test(css), false, 'the 10.5px one-off is gone');
});
