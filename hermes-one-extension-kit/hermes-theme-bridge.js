(() => {
  'use strict';

  /*
   * THESIS: A panel should be painted by the shell it lives in. Ours carried a
   *   palette of their own — near-black #0a0a0c with a paper-white accent — while
   *   the shell has 21 skins x light/dark. Measured live: default/dark is navy
   *   #0D0D1A on warm cream #FFF8DC with a GOLD #FFD700 accent; default/light is
   *   parchment #FEFCF7 on ink #1A1610 with #B8860B; catppuccin/light is #EFF1F5
   *   on #4C4F69 with a PURPLE #8839EF; geist-contrast/dark is pure #000000 on
   *   #ededed with #FFF175 and its own "Geist" font stack. A copied palette is
   *   wrong in 20 skins out of 21, and in any light skin our panels were a black
   *   rectangle inside a parchment shell.
   * OWN-WORLD: The host's live computed tokens, forwarded — never transcribed.
   *   Nothing in this file names a colour. The only hexes in the panel system are
   *   var() fallbacks that apply when the shell cannot be read at all.
   * STORY: An operator switches Settings -> Appearance to Catppuccin Light. The
   *   rail, the chat and all three panels change together, in the same frame.
   * FIRST VIEWPORT: nothing. This file adds no pixels of its own.
   * FORM: One global, window.HermesTheme, published by the hermes-panel
   *   extension — which is FIRST in extensions.json, so its deferred scripts run
   *   before the router, memory and office launchers mount anything.
   *
   * ── HOW A SKIN CHANGE IS HEARD ────────────────────────────────────────────
   * There is NO official read-side hook. Verified on the box, not assumed:
   *   - `grep CustomEvent boot.js` -> no match at all. Nothing in boot.js
   *     dispatches an event for theme, skin or appearance.
   *   - docs/EXTENSIONS.md ("Registering a custom theme (skin)", line 426+)
   *     documents only the WRITE direction, window.registerHermesSkin, and the
   *     core-side sanitizer. It never names a change notification.
   *   - window.hermesExt exposes settings/storage, not appearance.
   *
   * What the host does have is a single funnel of plain script-tag globals
   * (boot.js:2745 _applyTheme, :2763 _applySkin, :2730 _setResolvedTheme) —
   * verified live in the running shell: all three are typeof 'function'. Every
   * appearance path lands in them:
   *   - the Appearance pickers   -> _pickSkin/_pickTheme (boot.js:2770,2786)
   *   - the /theme slash command -> commands.js:1065,1082
   *   - boot rehydration         -> boot.js:3356-3358
   *   - the OS flipping dark/light in System mode -> _setResolvedTheme
   *   - a late registerHermesSkin() for the saved skin -> _applySkin (boot.js:2979)
   * So this wraps those three, exactly as hermes-panel-nav.js wraps switchPanel,
   * and is told about the change by the code that makes it.
   *
   * A MutationObserver on <html>'s class/data-skin/data-font-size is kept as a
   * SECOND path, not the primary one, because it is the only thing that would
   * still work if a host update renamed those functions, and because it costs one
   * coalesced re-read. Both paths funnel into the same idempotent sync().
   *
   * ── WHY VALUES ARE VALIDATED AS WELL AS SANITIZED ─────────────────────────
   * A forwarded value is written into CSS in ANOTHER document, so it is data even
   * though it came from the shell. Two different failures matter:
   *   1. INJECTION — a value carrying `;` or `{}` could end our declaration.
   *      The shell sanitizes tokens registered BY EXTENSIONS
   *      (boot.js:2910 _sanitizeSkinTokens, an allow-list of 30 names and a
   *      colour-shaped value regex), but a panel that trusted its parent
   *      completely would inherit any future hole in that. Hence UNSAFE below.
   *   2. GARBAGE — a value that is merely *not a colour* is worse for us than a
   *      missing one. `--bg: var(--host-bg, #0a0a0c)` falls back happily when
   *      --host-bg is unset, but if it is set to `notacolor` the declaration is
   *      invalid at computed-value time and `background` reverts to transparent —
   *      an unstyled, unreadable panel. So every value is type-checked against
   *      the property it will feed, and a value that fails is DROPPED, which
   *      restores the fallback. That is the whole of the fail-safe promise.
   */

  const NS = '--host-';

  /* The host token -> the name a panel sees -> the CSS type it must satisfy.
   *
   * Only what a panel can actually use: the shell declares 65 custom properties
   * on :root (counted live) and most are chat-bubble, message-body or skeleton
   * internals. Read live from the running shell across default/dark,
   * default/light, catppuccin/dark+light, github/light, neon/dark, hepburn/light,
   * ares/dark, mono/dark and geist-contrast/dark.
   *
   * Where our name differs from the host's, the rename says what the token MEANS
   * to a panel rather than where the host happens to use it. */
  const COLOR = 'color';
  const LEN = 'length';
  const FONT = 'font';

  const FORWARD = [
    // Planes, in the host's own lightness order: bg < sidebar < surface.
    ['bg', 'bg', COLOR],
    ['sidebar', 'sidebar', COLOR],
    ['surface', 'surface', COLOR],
    ['surface-subtle', 'surface-subtle', COLOR],
    ['hover-bg', 'hover-bg', COLOR],
    ['input-bg', 'input-bg', COLOR],
    ['code-bg', 'code-bg', COLOR],
    // Lines.
    ['border', 'border', COLOR],
    ['border2', 'border2', COLOR],
    ['border-subtle', 'border-subtle', COLOR],
    ['border-muted', 'border-muted', COLOR],
    // Text.
    ['text', 'text', COLOR],
    ['strong', 'strong', COLOR],
    ['muted', 'muted', COLOR],
    ['code-text', 'code-text', COLOR],
    // The accent family, which is what a skin actually changes.
    //
    // --accent and --accent-text are DIFFERENT tokens in the host and the
    // difference is contrast, not taste: default/light ships accent #B8860B for
    // fills and accent-text #8B6508 for type on the page background. Forwarding
    // both keeps a panel's borders on the skin's accent and its accent-coloured
    // words on the one the skin already tuned for reading.
    ['accent', 'accent', COLOR],
    ['accent-hover', 'accent-hover', COLOR],
    ['accent-text', 'accent-text', COLOR],
    ['accent-bg', 'accent-bg', COLOR],
    ['accent-bg-strong', 'accent-bg-strong', COLOR],
    // Foreground for something PAINTED accent. The host's own rule is
    // .panel-head-btn.primary{color:var(--panel-head-primary-fg,#fff)} with
    // :root.dark{--panel-head-primary-fg:var(--bg)} — so dark skins put the
    // background colour on gold and light skins fall back to white. Measured:
    // #0D0D1A in default/dark, #1E1E2E in catppuccin/dark, #000000 in
    // geist-contrast/dark, and EMPTY in every light skin sampled. Borrowed
    // whole, fallback included, rather than guessed per skin.
    ['panel-head-primary-fg', 'accent-fg', COLOR],
    ['focus-ring', 'focus-ring', COLOR],
    // State. Ours are ok/warn/bad/info; the host's are success/warning/error/info.
    // Kept under the host's names in the --host-* namespace so the mapping is
    // visible at the point of use in the stylesheet, not hidden here.
    ['success', 'success', COLOR],
    ['warning', 'warning', COLOR],
    ['error', 'error', COLOR],
    ['info', 'info', COLOR],
    // Type. --font-mono is declared by only SOME skins (measured: set in
    // github/light, empty in the other eight sampled) — see safe() on why empty
    // must be dropped rather than forwarded.
    ['font-ui', 'font-ui', FONT],
    ['font-mono', 'font-mono', FONT],
    ['font-size-xs', 'font-size-xs', LEN],
    ['font-size-sm', 'font-size-sm', LEN],
    ['font-size-md', 'font-size-md', LEN],
    // Shape.
    ['radius-sm', 'radius-sm', LEN],
    ['radius-md', 'radius-md', LEN],
    ['radius-lg', 'radius-lg', LEN],
    ['radius-pill', 'radius-pill', LEN],
  ];

  // Two facts a panel needs that the host keeps OUTSIDE its custom properties.
  const EXTRA = [`${NS}color-scheme`, `${NS}root-font`];

  // Injection guard. Font stacks and color-mix() have to pass, so this is a
  // deny-list of the things that end a declaration or fetch something, not the
  // host's colour-only allow-list.
  const UNSAFE = /[;{}<>]|url\s*\(|expression\s*\(|@import|\/\*|\\/i;

  // Type guard. CSS.supports is the browser's own parser, so this stays correct
  // for value shapes CSS grows later (the host already ships
  // `color-mix(in srgb, #2A2A45 60%, transparent)` as --border-subtle, and a
  // hand-written colour regex would have rejected it).
  const PROBE = { [COLOR]: 'color', [LEN]: 'font-size', [FONT]: 'font-family' };

  function typed(value, kind) {
    let supports;
    try { supports = window.CSS && window.CSS.supports; } catch (_) { supports = null; }
    // No CSS.supports (an old engine, or a test stub): the deny-list above still
    // holds, so accept. Degrading to "unstyled" here would be a worse failure
    // than the one being guarded against.
    if (typeof supports !== 'function') return true;
    try { return !!window.CSS.supports(PROBE[kind] || 'color', value); } catch (_) { return false; }
  }

  function safe(value, kind) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    // Empty is the common case, not an error: --font-mono is declared by only
    // some skins, so in default/dark it reads back as "". It must be SKIPPED and
    // any previous value REMOVED, because setting a custom property to the empty
    // string is not the same as leaving it unset — var(--x, fallback) then
    // resolves to nothing instead of to the fallback, and the panel loses the
    // legible default this whole file promises.
    if (!v) return null;
    if (v.length > 200) return null;
    if (UNSAFE.test(v)) return null;
    if (!typed(v, kind)) return null;
    return v;
  }

  const root = () => document.documentElement;

  function readHost() {
    const out = {};
    let cs;
    try { cs = getComputedStyle(root()); } catch (_) { return out; }
    if (!cs || typeof cs.getPropertyValue !== 'function') return out;
    for (const [from, to, kind] of FORWARD) {
      let raw = '';
      try { raw = cs.getPropertyValue(`--${from}`); } catch (_) { raw = ''; }
      const value = safe(raw, kind);
      if (value !== null) out[NS + to] = value;
    }
    // color-scheme decides the colour of a native scrollbar, a form control and
    // the iframe's own canvas before any CSS of ours paints. Hard-coded `dark` on
    // the frame gave a light skin dark scrollbars and a black flash on load.
    // The host carries it as a CLASS on <html> (measured: "dark pwa-browser
    // pwa-installable" in dark, no `dark` in light), never as a property.
    let dark = true;
    try { dark = root().classList.contains('dark'); } catch (_) { /* keep dark */ }
    out[`${NS}color-scheme`] = dark ? 'dark' : 'light';
    // The Appearance panel's font-size preference is applied as a root font-size
    // (12/14/16/18px via data-font-size), NOT as a custom property. Forwarded so
    // a panel can honour an accessibility setting; --t-body stays on the host's
    // stable --font-size-md so a console's fixed layout does not reflow to 18px
    // without opting in.
    try {
      const size = safe(cs.fontSize, LEN);
      if (size) out[`${NS}root-font`] = size;
    } catch (_) { /* optional */ }
    return out;
  }

  /* Every document that must be themed. The host page itself is one of them: our
   * panel chrome (.hermes-panel, .hp-frame, .hp-error) lives there and derives
   * from the same --host-* namespace, so there is ONE derivation to reason about
   * instead of two.
   *
   * The namespace is why writing to the host's own :root is safe: the host
   * declares --bg on :root, our stylesheet is scoped to .hermes-panel and reads
   * --host-bg. Nothing we write can repaint the shell, and nothing the shell
   * writes can be shadowed by us. */
  const frames = new Set();

  function apply(doc, tokens) {
    if (!doc) return false;
    let style;
    try { style = doc.documentElement.style; } catch (_) { return false; }
    if (!style || typeof style.setProperty !== 'function') return false;
    try {
      for (const [, to] of FORWARD) {
        const name = NS + to;
        if (name in tokens) style.setProperty(name, tokens[name]);
        else style.removeProperty(name);
      }
      for (const name of EXTRA) {
        if (name in tokens) style.setProperty(name, tokens[name]);
        else style.removeProperty(name);
      }
    } catch (_) { return false; }
    return true;
  }

  function frameDoc(frame) {
    // A frame can be cross-origin (blocked), not yet navigated, or already gone
    // from the DOM. None of those is an error worth a console line, and none may
    // stop the other frames from being themed.
    try {
      if (!frame) return null;
      if (frame.isConnected === false) return null;
      return frame.contentDocument || null;
    } catch (_) { return null; }
  }

  let pending = false;

  function sync() {
    pending = false;
    const tokens = readHost();
    apply(document, tokens);
    for (const frame of frames) {
      // A panel can be torn down; holding its frame forever would leak the
      // document it points at.
      if (frame && frame.isConnected === false) { frames.delete(frame); continue; }
      const doc = frameDoc(frame);
      if (doc) apply(doc, tokens);
    }
    return tokens;
  }

  function schedule() {
    // A skin change runs _applyTheme then _applySkin then a picker re-render, and
    // the OS flipping dark/light can arrive in the same task. One re-read per
    // frame, not three.
    if (pending) return;
    pending = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(sync);
    else setTimeout(sync, 0);
  }

  /**
   * Theme a frame, now and for as long as it lives.
   *
   * A panel opened BEFORE this file ran, and a frame that reloads, both have to
   * end up themed. Two distinct orderings, both real:
   *   - the launchers mount lazily on first open, so the frame usually does not
   *     exist yet when this runs — the childList observer and the launchers'
   *     direct adopt() call cover that;
   *   - a srcdoc console re-rendered by its sidecar, and the office's src frame
   *     navigating, both hand back a BRAND NEW documentElement with none of our
   *     properties on it — the `load` listener covers that.
   * So: apply immediately if the document is reachable, and re-apply on every
   * load event thereafter.
   */
  function adopt(frame) {
    if (!frame || frames.has(frame)) return;
    frames.add(frame);
    try {
      frame.addEventListener('load', () => {
        const doc = frameDoc(frame);
        if (doc) apply(doc, readHost());
      });
    } catch (_) { /* a stub element without listeners still gets the push */ }
    const doc = frameDoc(frame);
    if (doc) apply(doc, readHost());
  }

  function adoptAll(scope) {
    let found;
    try { found = (scope || document).querySelectorAll('iframe'); } catch (_) { return; }
    for (const frame of found) adopt(frame);
  }

  /**
   * The other direction: a document INSIDE a frame pulling its own theme.
   *
   * The push above is the primary path and is enough for correctness, but it
   * cannot beat the frame's own first paint — the office is a src iframe running
   * a built app, and between navigation and the parent's load handler there is
   * one frame in which nothing of ours is set. Verified reachable from inside a
   * same-origin frame:
   *   parent.getComputedStyle(parent.document.documentElement)
   *     .getPropertyValue('--accent')  ->  "#FFD700"
   * So a framed consumer that loads this file self-themes synchronously at parse
   * time and never shows the fallback palette. Idempotent with the push: both
   * write the same values to the same place.
   */
  function pull() {
    let host;
    try { host = window.parent; } catch (_) { return false; }
    if (!host || host === window) return false;
    let cs;
    try { cs = host.getComputedStyle(host.document.documentElement); } catch (_) { return false; }
    if (!cs) return false;
    const tokens = {};
    for (const [from, to, kind] of FORWARD) {
      let raw = '';
      try { raw = cs.getPropertyValue(`--${from}`); } catch (_) { raw = ''; }
      const value = safe(raw, kind);
      if (value !== null) tokens[NS + to] = value;
    }
    let dark = true;
    try { dark = host.document.documentElement.classList.contains('dark'); } catch (_) { /* keep dark */ }
    tokens[`${NS}color-scheme`] = dark ? 'dark' : 'light';
    try {
      const size = safe(cs.fontSize, LEN);
      if (size) tokens[`${NS}root-font`] = size;
    } catch (_) { /* optional */ }
    // Nothing readable at all -> leave the stylesheet's own fallbacks standing
    // rather than clearing properties a previous push may have set.
    if (Object.keys(tokens).length <= 1) return false;
    return apply(document, tokens);
  }

  // Wrap the host's own appliers. See the header for why these three and not an
  // event: they are the funnel every appearance change passes through.
  function wrapAppliers() {
    let wrapped = 0;
    for (const name of ['_applySkin', '_applyTheme', '_setResolvedTheme']) {
      const original = window[name];
      if (typeof original !== 'function' || original.__hermesThemeWrapped) continue;
      const wrapper = function hermesThemeAware(...args) {
        // AFTER the host, never before: the tokens we forward are the RESOLVED
        // ones, and they only resolve once .dark and data-skin are on <html>.
        const result = original.apply(this, args);
        schedule();
        return result;
      };
      wrapper.__hermesThemeWrapped = true;
      try { window[name] = wrapper; wrapped += 1; } catch (_) { /* frozen: observer covers it */ }
    }
    return wrapped;
  }

  function observe() {
    if (typeof MutationObserver !== 'function') return;
    // <html> attributes: the second path to hearing a skin change, and the only
    // one that survives the host renaming its appliers. _applySkin writes
    // data-skin and _setResolvedTheme toggles the `dark` class, so both are
    // covered by attribute alone.
    try {
      new MutationObserver(schedule).observe(root(), {
        attributes: true,
        attributeFilter: ['class', 'data-skin', 'data-font-size'],
      });
    } catch (_) { /* nothing else to do */ }
    // New frames. The three launchers build their panel lazily, on first open, so
    // the frame that needs theming usually does not exist when this runs.
    try {
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes || []) {
            if (!node || node.nodeType !== 1) continue;
            if (node.tagName === 'IFRAME') adopt(node);
            else adoptAll(node);
          }
        }
      }).observe(root(), { childList: true, subtree: true });
    } catch (_) { /* adopt() is also called directly by the launchers */ }
  }

  function start() {
    wrapAppliers();
    observe();
    adoptAll(document);
    sync();
  }

  window.HermesTheme = {
    /** Re-read the shell and repaint every adopted document. Idempotent. */
    sync,
    /** Register an iframe (also done automatically for any iframe in the page). */
    adopt,
    /** Self-theme from the parent, for a document running INSIDE a panel frame. */
    pull,
    /** The forwarded values, for JS that cannot use CSS — e.g. 3D materials. */
    tokens: readHost,
    /** One forwarded value, resolved, with a caller-supplied fallback. */
    token: (name, fallback = '') => {
      const key = name.startsWith(NS) ? name : NS + name.replace(/^--/, '');
      const value = readHost()[key];
      return value === undefined ? fallback : value;
    },
    /** Which tokens are forwarded, so a consumer can assert rather than assume. */
    forwarded: () => FORWARD.map(([, to]) => NS + to).concat(EXTRA),
  };

  // Ordering. Two cases, and the file has to be right in both:
  //  - LOADED IN THE HOST PAGE (the normal one). The shell applies theme and skin
  //    from localStorage in an inline <head> script before first paint
  //    (THEMES.md, "No flash on load"), so the tokens are already resolved by the
  //    time a deferred extension script runs. DOMContentLoaded is still honoured
  //    in case this is loaded early, and `load` catches a frame that was in the
  //    initial HTML.
  //  - LOADED INSIDE A PANEL FRAME. There is no host chrome to wait for and no
  //    frame to adopt; the one useful act is to pull the parent's tokens now,
  //    synchronously, before this document's first paint.
  let framed = false;
  try { framed = !!window.parent && window.parent !== window; } catch (_) { framed = true; }

  if (framed) {
    pull();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  if (!framed) {
    window.addEventListener?.('load', () => { adoptAll(document); schedule(); });
  }
})();
