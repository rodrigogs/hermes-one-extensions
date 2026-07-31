(() => {
  'use strict';

  /*
   * THESIS: The office is one of three panels in one shell, not a separate app.
   * OWN-WORLD: The host's rail and central view; the 3D city is the artefact and
   *   leads, while the chrome around it obeys the shared panel system.
   * STORY: An operator taps Office, the city opens where Sessions and Memory
   *   open, and tapping away and back does not reload the scene.
   * FIRST VIEWPORT: The city. This file adds no chrome above it.
   * FORM: Hermes One rail/sidebar extension mounting an iframe in .main-view.
   */
  // This used to call window.location.assign('/office/'), which left the Hermes
  // One shell entirely: the rail, the sidebar and the current session all
  // disappeared, and getting back meant a full reload of the app. The router and
  // memory consoles both mount in the central panel; the office was the odd one
  // out for no reason other than that it was easier.
  //
  // It mounts by `src` rather than `srcdoc`. The two sidecar consoles send
  // X-Frame-Options: DENY and can only be framed from a same-origin srcdoc; the
  // office app sends SAMEORIGIN with frame-ancestors 'self', so a plain src is
  // both allowed and better — it keeps its own URL, so its router and asset
  // paths resolve normally. Verified live: the frame loads, reports
  // location.pathname === '/office/' and paints its canvas.
  //
  // Navigation and visibility come from the shared HermesPanelNav; see
  // hermes-one-extension-kit/hermes-panel-nav.js for what that fixes and why.
  const OFFICE_PATH = '/office/';
  const PANEL_ID = 'office-3d-panel';
  const ICON = '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/>'
    + '<path d="M9 10h1"/><path d="M14 10h1"/><path d="M9 14h1"/><path d="M14 14h1"/>'
    + '<path d="M10 21v-3h4v3"/>';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  let nav = null;

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = el('section', 'main-view hermes-panel office-3d-panel');
    panel.id = PANEL_ID;
    const frame = el('iframe', 'hp-frame');
    frame.title = 'Office 3D';
    frame.dataset.officeFrame = 'true';
    // The scene needs pointer capture for orbit; nothing else is granted.
    frame.setAttribute('allow', 'fullscreen');
    panel.append(frame);
    document.querySelector('main')?.append(panel);
    if (nav) nav.adopt(panel);
    return panel;
  }

  // Load once. The city is ~30 GLB files and several seconds of work, so
  // reloading it every time the operator glances at another panel would make the
  // office feel broken. Leaving the frame mounted keeps the camera where they
  // left it.
  function load(panel) {
    const frame = panel.querySelector('[data-office-frame]');
    if (!frame || frame.dataset.loaded === 'true') return;
    frame.addEventListener('error', () => showError(panel), { once: true });
    frame.src = OFFICE_PATH;
    frame.dataset.loaded = 'true';
  }

  function showError(panel) {
    panel.querySelector('[data-office-frame]')?.remove();
    if (panel.querySelector('.hp-error')) return;
    const message = el('div', 'hp-error',
      'The Office scene could not be loaded. Check that hermes-office-web is running, then reopen this panel.');
    message.setAttribute('role', 'alert');
    panel.append(message);
  }


  // The Office sidebar. The host shows exactly one .panel-view; without one of our
  // own the drawer kept displaying the chat conversation list behind an open
  // Office. Header markup mirrors the host's other panels so it inherits their
  // styling rather than shipping a second look.
  function buildSidebar(view) {
    const head = el('div', 'panel-head');
    const title = el('div', 'panel-head-title', 'OFFICE');
    head.append(title);

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'panel-head-btn has-tooltip';
    reload.dataset.tooltip = 'Reload the scene';
    reload.setAttribute('aria-label', 'Reload the scene');
    reload.textContent = '\u21bb';
    reload.addEventListener('click', () => {
      const frame = document.querySelector('[data-office-frame]');
      if (!frame) return;
      frame.dataset.loaded = 'false';
      frame.src = OFFICE_PATH;
      frame.dataset.loaded = 'true';
    });
    head.append(reload);
    view.append(head);

    const body = el('div', 'office-side-body');
    const hint = el('div', 'office-side-hint',
      'Drag to orbit \u00b7 scroll to zoom \u00b7 click a building to enter.');
    body.append(hint);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'office-side-action';
    open.textContent = 'Open in a new tab';
    open.addEventListener('click', () => window.open(OFFICE_PATH, '_blank', 'noopener'));
    body.append(open);

    view.append(body);
  }

  function onOpen() {
    const panel = ensurePanel();
    if (nav) nav.show();
    load(panel);
  }

  if (!window.HermesPanelNav) {
    console.error('[office-3d-launcher] Hermes One Extension Kit did not load; the '
      + 'Office button cannot be installed. Check that "hermes-one-extension-kit" is listed '
      + 'BEFORE "office-3d-launcher" in extensions.json.');
    return;
  }

  nav = window.HermesPanelNav.register({
    token: 'office',
    label: 'Office',
    title: 'Office 3D',
    iconPath: ICON,
    navClass: 'office-3d-nav',
    onOpen,
    sidebarView: buildSidebar,
  });
})();
