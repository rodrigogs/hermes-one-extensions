// The shared panel navigation, which three surfaces now depend on.
//
// This file exists because of two bugs that were not visual and not caught by any
// screenshot:
//
//   1. An extension panel hid itself with [hidden] and ignored the host's
//      `showing-<panel>` classes. Tapping a native tab set showing-kanban and
//      left the extension panel visible on top of it — measured live: <main> read
//      "main showing-kanban" while the router panel was the only visible view. An
//      operator who opened Router could not leave it.
//   2. On a phone the sidebar drawer stayed open over the panel the tap had just
//      opened, because the host's own close call was never made.
//
// Both are behaviours of this module, so they are pinned here rather than
// re-discovered per surface.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const path = require('node:path');

// Anchored to __dirname, not to the CWD. A bare 'hermes-panel-nav.js' resolves
// against wherever the runner was launched, so this suite was 17/17 ENOENT from
// the repo root and only green when someone happened to cd into this directory
// first. Both layouts exist: the deployed extension keeps tests/ inside the
// extension directory, the checkout keeps them side by side.
const SOURCE_CANDIDATES = [
  path.join(__dirname, '..', 'hermes-panel-nav.js'),
  path.join(__dirname, 'hermes-panel-nav.js'),
];
const sourcePath = SOURCE_CANDIDATES.find((p) => fs.existsSync(p)) || SOURCE_CANDIDATES[0];

// A DOM stub with the parts this module actually touches: class lists that
// behave, a queryable tree, and dataset<->attribute duality where it matters.
function fakeDom({ desktop = true } = {}) {
  const all = [];

  const make = (tag) => {
    const node = {
      tagName: tag, id: '', textContent: '', innerHTML: '', type: '',
      dataset: {}, attrs: {}, children: [], parent: null,
      _classes: new Set(),
      get className() { return [...node._classes].join(' '); },
      set className(v) { node._classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: {
        add: (...c) => c.forEach((x) => node._classes.add(x)),
        remove: (...c) => c.forEach((x) => node._classes.delete(x)),
        toggle: (c, on) => {
          const next = on === undefined ? !node._classes.has(c) : !!on;
          if (next) node._classes.add(c); else node._classes.delete(c);
          return next;
        },
        contains: (c) => node._classes.has(c),
      },
      append(...kids) { kids.forEach((k) => { k.parent = node; node.children.push(k); }); },
      insertBefore(kid, ref) {
        kid.parent = node;
        const at = ref ? node.children.indexOf(ref) : -1;
        if (at < 0) node.children.push(kid); else node.children.splice(at, 0, kid);
      },
      addEventListener(type, fn) { (node._on ||= {})[type] = fn; },
      setAttribute(name, value) {
        node.attrs[name] = String(value);
        if (name.startsWith('data-')) {
          node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
        }
      },
      getAttribute(name) { return node.attrs[name] ?? null; },
      get parentElement() { return node.parent; },
      get nextSibling() {
        if (!node.parent) return null;
        const kids = node.parent.children;
        return kids[kids.indexOf(node) + 1] || null;
      },
      querySelector(sel) { return descend(node).find((n) => matches(n, sel)) || null; },
      querySelectorAll(sel) { return descend(node).filter((n) => matches(n, sel)); },
      click() { node._on?.click?.(); },
    };
    all.push(node);
    return node;
  };

  const descend = (root) => root.children.flatMap((c) => [c, ...descend(c)]);

  // Enough selector support for what the module uses, and no more — a fake that
  // silently matches nothing is how a test passes while the code is broken.
  const matches = (n, sel) => sel.split(',').map((s) => s.trim()).some((one) => {
    let m;
    if ((m = one.match(/^\[data-panel\^="(.+)"\](\.active)?$/))) {
      return String(n.dataset.panel || '').startsWith(m[1])
        && (!m[2] || n._classes.has('active'));
    }
    if ((m = one.match(/^\[data-panel="(.+)"\]$/))) return n.dataset.panel === m[1];
    if (one === '[data-panel].active') {
      return n.dataset.panel !== undefined && n._classes.has('active');
    }
    if (one === '[data-panel]') return n.dataset.panel !== undefined;
    if ((m = one.match(/^\[data-(.+)\]$/))) return n.attrs[`data-${m[1]}`] !== undefined;
    // `main > .x` — a real child check, not a class check that happens to pass.
    // The stub used to support only the selectors the OLD implementation used, so
    // when the module changed to `main > .main-view` (the documented one) every
    // query returned nothing and the assertions failed for a stub reason rather
    // than a code reason. A fake that answers only the questions you expected is a
    // fake that stops testing the moment the code improves.
    if ((m = one.match(/^main > \.([a-z-]+)(\[data-panel-token\])?$/))) {
      if (n.parent?.tagName !== 'main' || !n._classes.has(m[1])) return false;
      return m[2] ? n.dataset.panelToken !== undefined : true;
    }
    if (one.startsWith('.')) return n._classes.has(one.slice(1));
    return false;
  });

  const HOST_PANELS = ['settings', 'skills', 'memory', 'tasks', 'kanban', 'workspaces',
    'profiles', 'insights', 'logs', 'plugin'];

  const main = make('main'); main.className = 'main';
  // A couple of the host's own views, so "exactly one showing" is a real claim
  // rather than a claim about our panels alone.
  for (const panel of ['chat', 'kanban']) {
    const view = make('section');
    view.className = 'main-view';
    view.id = `main${panel[0].toUpperCase()}${panel.slice(1)}`;
    view.dataset.hostPanel = panel;
    view.hidden = panel !== 'chat';
    main.append(view);
  }
  const rail = make('div'); rail.className = 'rail';
  const sidebar = make('nav'); sidebar.className = 'sidebar-nav';

  // The host's own tabs, in the order the real shell has them.
  for (const panel of ['chat', 'tasks', 'kanban', 'skills', 'memory', 'settings']) {
    for (const host of [rail, sidebar]) {
      const tab = make('button');
      tab.className = 'nav-tab';
      tab.setAttribute('data-panel', panel);
      host.append(tab);
    }
  }

  const document = {
    documentElement: make('html'),
    createElement: make,
    getElementById: (id) => all.find((n) => n.id === id) || null,
    querySelector: (sel) => {
      if (sel === 'main.main' || sel === 'main') return main;
      if (sel === '.rail') return rail;
      if (sel === '.sidebar-nav') return sidebar;
      return descend(main).concat(descend(rail), descend(sidebar)).find((n) => matches(n, sel)) || null;
    },
    querySelectorAll: (sel) => [main, rail, sidebar]
      .flatMap((root) => descend(root))
      .filter((n) => matches(n, sel)),
    addEventListener() {},
    readyState: 'complete',
  };

  const closed = [];
  const observers = [];

  // A faithful-enough switchPanel. The module WRAPS this, so a stub that merely
  // records calls would not exercise the wrapper at all; this does what the real
  // one does in the parts the module depends on: toggle .active over every
  // [data-panel], set the showing-<panel> token (chat gets none, being the host's
  // default), toggle the built-in views' `hidden`, and — the branch that caused the
  // desktop defect — short-circuit when the same panel is clicked twice with the
  // sidebar open.
  const hostState = { current: 'chat', collapsed: false, switches: [] };
  const switchPanel = (next, opts = {}) => {
    const prev = hostState.current;
    if (opts.fromRailClick && desktop) {
      if (hostState.collapsed) hostState.collapsed = false;
      else if (prev === next) { hostState.collapsed = true; return false; }
    }
    hostState.current = next;
    hostState.switches.push(next);
    document.querySelectorAll('[data-panel]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.panel === next);
    });
    for (const t of HOST_PANELS) main.classList.toggle(`showing-${t}`, t === next);
    document.querySelectorAll('main > .main-view').forEach((view) => {
      if (!view.dataset.panelToken) view.hidden = view.dataset.hostPanel !== next;
    });
    return true;
  };

  const window = {
    // Honour the query. Answering `desktop` to every question meant the module's
    // own fallback path (matchMedia('(min-width:641px)')) was never really tested.
    matchMedia: (q) => ({ matches: /min-width:\s*641px/.test(q) ? desktop : !desktop }),
    _isDesktopWidth: () => desktop,
    closeMobileSidebar: () => closed.push(true),
    switchPanel,
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe() { this.observing = true; }
      disconnect() { this.observing = false; }
    },
  };

  // A host nav button click, exactly as index.html wires it:
  //   onclick="switchPanel('kanban',{fromRailClick:true})"
  const hostSwitchesTo = (panel) => window.switchPanel(panel, { fromRailClick: true });

  return { document, window, main, rail, sidebar, make, closed, matches, descend,
           observers, hostSwitchesTo, hostState, switchPanel };
}

function load({ desktop = true } = {}) {
  const dom = fakeDom({ desktop });
  const context = {
    console,
    document: dom.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  return { dom, nav: context.window.HermesPanelNav };
}

// A surface, registered the way the three real ones do it.
function surface(nav, dom, { token = 'router', label = 'Router', after } = {}) {
  const opened = [];
  const handle = nav.register({
    token, label, title: `${label} full`,
    iconPath: '<path d="M0 0"/>',
    navClass: `${token}-nav`,
    onOpen: () => opened.push(true),
    after,
  });
  // The panel element, built by the surface and adopted, as in the real scripts.
  const panel = dom.make('section');
  panel.className = 'main-view hermes-panel';
  panel.id = `${token}-panel`;
  dom.main.append(panel);
  handle.adopt(panel);
  return { handle, panel, opened };
}

test('a nav button is a real host tab, so the host can see and clear it', () => {
  const { dom, nav } = load();
  surface(nav, dom);
  const button = dom.sidebar.querySelector('[data-router-nav]');
  assert.ok(button, 'the sidebar button must exist');
  // Without data-panel the host's own
  //   querySelectorAll('[data-panel]').forEach(t => t.classList.toggle('active', ...))
  // cannot see this button: it never lights up, and never turns off.
  assert.equal(button.dataset.panel, 'x-router');
  assert.ok(button._classes.has('nav-tab'), 'it must wear the host tab class');
  // The x- prefix keeps it out of the host's MAIN_VIEW_PANELS, so switchPanel
  // never tries to open a panel-view that does not exist.
  assert.ok(button.dataset.panel.startsWith('x-'));
});

test('opening a panel shows exactly one view and marks the tab', () => {
  const { dom, nav } = load();
  const { panel, opened } = surface(nav, dom);
  dom.sidebar.querySelector('[data-router-nav]').click();

  assert.deepEqual(opened, [true], 'the surface must be told to load');
  assert.equal(panel.hidden, false, 'the panel is shown by the documented [hidden] toggle');
  // Our panels are governed by `hidden`; the host's are governed by its own
  // showing-<panel> classes and we must not touch their attribute — a `hidden` we
  // set on #mainKanban is one nobody ever clears, and our
  // `main > .main-view[hidden]{display:none!important}` would then outrank the
  // host's rule forever. Measured before this split: returning to Kanban left
  // _currentPanel='kanban' and showing-kanban on <main> with #mainKanban at zero
  // height — an empty screen.
  const oursVisible = dom.main.children
    .filter((v) => v.dataset.panelToken && !v.hidden)
    .map((v) => v.dataset.panelToken);
  assert.deepEqual(oursVisible, ['router'], 'exactly one extension panel shows');
  const hostTouched = dom.main.children.filter((v) => !v.dataset.panelToken && v.hidden === true
    && v.dataset.hostPanel === 'chat');
  assert.equal(hostTouched.length, 0,
    'chat is suppressed by the stylesheet, not by setting an attribute the host never clears');
  assert.ok(dom.main._classes.has('showing-x-router'), 'and the token is published');
  const active = dom.document.querySelectorAll('[data-panel].active').map((b) => b.dataset.panel);
  assert.deepEqual([...new Set(active)], ['x-router'], 'only our tab is active');
});

test('opening one extension panel closes the other', () => {
  const { dom, nav } = load();
  const router = surface(nav, dom, { token: 'router' });
  const memory = surface(nav, dom, { token: 'memory', label: 'Graph', after: 'memory' });

  dom.sidebar.querySelector('[data-router-nav]').click();
  dom.sidebar.querySelector('[data-memory-nav]').click();

  assert.equal(memory.panel.hidden, false);
  assert.equal(router.panel.hidden, true, 'two panels must never show at once');
  assert.ok(dom.main._classes.has('showing-x-memory'));
  assert.ok(!dom.main._classes.has('showing-x-router'));
});

test('opening an extension panel parks the host on its default', () => {
  const { dom, nav } = load();
  surface(nav, dom);
  // The operator was on Kanban.
  dom.hostSwitchesTo('kanban');
  assert.equal(dom.hostState.current, 'kanban');

  dom.sidebar.querySelector('[data-router-nav]').click();

  // Driving the host — rather than writing its classes off behind its back — is
  // what keeps _currentPanel truthful. Leaving it on 'kanban' is what made the
  // next tap on Kanban a no-op, and what made the mobile drawer tear the panel
  // down when it re-synced .active from that stale value.
  assert.equal(dom.hostState.current, 'chat', 'the host is told, not overwritten');
  assert.ok(!dom.main._classes.has('showing-kanban'), 'so its own token is cleared by IT');
});

test('the operator can always leave, including back to the tab they came from', () => {
  // THE regression, and the one the previous implementation reintroduced. With the
  // host left believing _currentPanel === 'kanban', switchPanel's
  // `else if (prevPanel === nextPanel)` branch collapsed the sidebar and returned
  // false — the panel stayed and the click was swallowed.
  const { dom, nav } = load();
  const { panel } = surface(nav, dom);

  dom.hostSwitchesTo('kanban');
  dom.sidebar.querySelector('[data-router-nav]').click();
  assert.equal(panel.hidden, false, 'precondition: our panel is open');

  const switched = dom.hostSwitchesTo('kanban');
  assert.notEqual(switched, false, 'the click must not be swallowed');
  assert.equal(panel.hidden, true, 'the extension panel stands down');
  assert.ok(!dom.main._classes.has('showing-x-router'), 'and its token is gone');
  assert.ok(dom.main._classes.has('showing-kanban'), 'the host owns the view again');
  assert.equal(dom.hostState.collapsed, false, 'and the sidebar was not collapsed instead');
});

test('returning to chat also releases the view', () => {
  // Chat is the host's DEFAULT: switchPanel sets no showing-* token for it, so a
  // mechanism keyed on host tokens would never hear about it.
  const { dom, nav } = load();
  const { panel } = surface(nav, dom);
  dom.sidebar.querySelector('[data-router-nav]').click();
  assert.equal(panel.hidden, false);

  dom.hostSwitchesTo('chat');
  assert.equal(panel.hidden, true, 'chat must reclaim the view too');
  assert.ok(!dom.main._classes.has('showing-x-router'));
});

test('the host keeps its own teardown, because it is the host that switches', () => {
  // switchPanel is what stops the Kanban SSE stream (panels.js:394) and re-syncs
  // the logs poll. The previous implementation never called it, so those kept
  // running while an extension panel was open.
  const { dom, nav } = load();
  surface(nav, dom);
  dom.hostSwitchesTo('kanban');
  const before = dom.hostState.switches.length;
  dom.sidebar.querySelector('[data-router-nav]').click();
  assert.ok(dom.hostState.switches.length > before,
    'opening a panel must go through the host, not around it');
});

test('on a phone, opening a panel closes the drawer over it', () => {
  const { dom, nav } = load({ desktop: false });
  surface(nav, dom);
  dom.sidebar.querySelector('[data-router-nav]').click();
  // The host's own nav buttons call _closeMobileSidebarAfterPanelSelection();
  // ours did not, so the drawer stayed open on top of the panel the tap opened.
  assert.deepEqual(dom.closed, [true], 'the host close must be called exactly once');
});

test('on a desktop, opening a panel does not touch the sidebar', () => {
  const { dom, nav } = load({ desktop: true });
  surface(nav, dom);
  dom.sidebar.querySelector('[data-router-nav]').click();
  // closeMobileSidebar on desktop would collapse a sidebar the operator wants
  // open. The host guards with _isDesktopWidth(); so must we.
  assert.deepEqual(dom.closed, [], 'the drawer is not a mobile concern on desktop');
});

test('buttons land next to the host tab they belong beside', () => {
  const { dom, nav } = load();
  surface(nav, dom, { token: 'router' });
  surface(nav, dom, { token: 'memory', label: 'Graph', after: 'memory' });

  const order = dom.sidebar.children.map((b) => b.dataset.panel);
  assert.equal(order[order.indexOf('kanban') + 1], 'x-router',
    'Router sits after Kanban');
  assert.equal(order[order.indexOf('memory') + 1], 'x-memory',
    'Graph sits after the host Memory tab, not at the end after Settings');
  // The specific bug: appended at the end, Memory graph landed after Settings
  // while its two siblings sat mid-list.
  assert.notEqual(order[order.length - 1], 'x-memory');
});

test('installing twice does not produce two buttons', () => {
  const { dom, nav } = load();
  surface(nav, dom);
  // register() is called once per script load, but the MutationObserver retry can
  // run install again; the guard is the data-<navClass> attribute.
  const again = nav.register({
    token: 'router', label: 'Router', iconPath: '<path d="M0 0"/>',
    navClass: 'router-nav', onOpen() {},
  });
  assert.ok(again, 'a second register must not throw');
  assert.equal(dom.sidebar.querySelectorAll('[data-router-nav]').length, 1);
  assert.equal(dom.rail.querySelectorAll('[data-router-nav]').length, 1);
});

test('a short label and a full title can differ', () => {
  const { dom, nav } = load();
  surface(nav, dom, { token: 'memory', label: 'Graph', after: 'memory' });
  const button = dom.sidebar.querySelector('[data-memory-nav]');
  // The host already has a Memory tab; two buttons reading "Memory" that open
  // different screens is a guess the operator makes every time. The short label
  // goes under the icon, the full name into the tooltip and the accessible name.
  assert.equal(button.dataset.label, 'Graph');
  assert.equal(button.dataset.tooltip, 'Graph full');
  assert.equal(button.getAttribute('aria-label'), 'Graph full');
});

test('a surface that fails to open does not take the shell down with it', () => {
  const { dom, nav } = load();
  const handle = nav.register({
    token: 'router', label: 'Router', iconPath: '<path d="M0 0"/>',
    navClass: 'router-nav',
    onOpen() { throw new Error('sidecar exploded'); },
  });
  assert.ok(handle);
  // A throwing onOpen must not prevent the panel being shown or leave the drawer
  // open: the operator should see the surface's own error state, not a dead tap.
  assert.doesNotThrow(() => dom.sidebar.querySelector('[data-router-nav]').click());
  assert.ok(dom.main._classes.has('showing-x-router'));
});

test('a button installs even when the shell is not built yet', () => {
  // Extension scripts are deferred, so they normally run after the rail exists —
  // but not always: the host builds its sidebar from JS, and on a slow first load
  // the nav can be absent when register() runs. Without the retry the button is
  // silently never installed, which is indistinguishable from a broken extension.
  const dom = fakeDom();
  // Hide the rail and nav from the module's first look.
  const realQuery = dom.document.querySelector;
  let shellReady = false;
  dom.document.querySelector = (sel) => {
    if ((sel === '.rail' || sel === '.sidebar-nav') && !shellReady) return null;
    return realQuery(sel);
  };

  const context = {
    console, document: dom.document, window: dom.window,
    MutationObserver: dom.window.MutationObserver,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });

  context.window.HermesPanelNav.register({
    token: 'router', label: 'Router', iconPath: '<path d="M0 0"/>',
    navClass: 'router-nav', onOpen() {},
  });
  assert.equal(dom.sidebar.querySelector('[data-router-nav]'), null,
    'nothing to install into yet');

  // The shell arrives; the observer fires.
  shellReady = true;
  dom.observers.filter((o) => o.observing).forEach((o) => o.fn([], o));

  assert.ok(dom.sidebar.querySelector('[data-router-nav]'), 'the retry must install it');
  assert.ok(dom.rail.querySelector('[data-router-nav]'), 'in both places');
});

test('the retry stops once it has installed', () => {
  // An observer left attached to documentElement with subtree:true fires on every
  // DOM mutation in the app, forever, for nothing.
  const dom = fakeDom();
  const context = {
    console, document: dom.document, window: dom.window,
    MutationObserver: dom.window.MutationObserver,
  };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  context.window.HermesPanelNav.register({
    token: 'router', label: 'Router', iconPath: '<path d="M0 0"/>',
    navClass: 'router-nav', onOpen() {},
  });
  // Installed on the first try, so NO observer should remain attached: the host is
  // now watched by wrapping switchPanel, not by observing class mutations, and the
  // only MutationObserver left is the install retry — which must not be created
  // when the install succeeded immediately.
  const attached = dom.observers.filter((o) => o.observing).length;
  assert.equal(attached, 0, `no observer should linger, got ${attached}`);
});

test('a panel does not appear before the operator asks for it', () => {
  // The surface creates its panel element during its first open, but register() runs
  // at page load — and a panel that is visible on adoption covers whatever the
  // operator was reading. The host's documented snippet sets `panel.hidden = true`
  // at construction for exactly this reason (EXTENSIONS.md:561).
  const { dom, nav } = load();
  const handle = nav.register({
    token: 'router', label: 'Router', iconPath: '<path d="M0 0"/>',
    navClass: 'router-nav', onOpen() {},
  });
  const panel = dom.make('section');
  panel.className = 'main-view hermes-panel';
  dom.main.append(panel);
  handle.adopt(panel);

  assert.equal(panel.hidden, true, 'adopted, not shown');
  // And the host's own view is untouched: adopting must not steal the screen.
  const chat = dom.main.children.find((v) => v.dataset.hostPanel === 'chat');
  assert.equal(chat.hidden, false, 'chat keeps the view until something opens');
});

test('the host views are left for the host to govern', () => {
  // The regression this pins was measured live: show() hid EVERY main-view, as the
  // doc's single-extension snippet does. But the host governs its views by class
  // (main.main.showing-kanban > #mainKanban { display: flex }) and never clears
  // their `hidden` attribute — so a `hidden` we set is permanent, and our own
  // `main > .main-view[hidden] { display: none !important }` then beats the host's
  // rule for the rest of the session. Returning to Kanban produced an empty screen:
  // _currentPanel 'kanban', showing-kanban on <main>, #mainKanban zero height.
  const { dom, nav } = load();
  surface(nav, dom);
  const kanbanView = dom.main.children.find((v) => v.dataset.hostPanel === 'kanban');

  dom.hostSwitchesTo('kanban');
  assert.equal(kanbanView.hidden, false, 'the host showed its own view');

  dom.sidebar.querySelector('[data-router-nav]').click();
  // Our panel is up. The host's view may be hidden — but only because the HOST
  // hid it when we drove switchPanel('chat'), never because we set the attribute
  // ourselves on a node we do not own.
  dom.hostSwitchesTo('kanban');
  assert.equal(kanbanView.hidden, false,
    'and it can show it again — we never wrote an attribute it does not clear');
});
