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
  // The Office sidebar. Markup mirrors the host's own panel-views exactly — a
  // bare <span> title, actions inside .panel-head-actions, .panel-head-btn with
  // has-tooltip and an inline SVG — so it inherits Hermes One's styling instead
  // of shipping a second look that drifts on every host restyle.
  function buildSidebar(view) {
    const head = el('div', 'panel-head');
    const title = document.createElement('span');
    title.textContent = 'Office';
    head.append(title);

    const actions = el('div', 'panel-head-actions');
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'panel-head-btn has-tooltip has-tooltip--bottom-right';
    reload.dataset.tooltip = 'Reload scene';
    reload.setAttribute('aria-label', 'Reload scene');
    reload.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>';
    reload.addEventListener('click', () => {
      const frame = document.querySelector('[data-office-frame]');
      if (!frame) return;
      frame.src = OFFICE_PATH;
      frame.dataset.loaded = 'true';
    });
    actions.append(reload);

    const popout = document.createElement('button');
    popout.type = 'button';
    popout.className = 'panel-head-btn has-tooltip has-tooltip--bottom-right';
    popout.dataset.tooltip = 'Open in a new tab';
    popout.setAttribute('aria-label', 'Open in a new tab');
    popout.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
      + '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
    popout.addEventListener('click', () => window.open(OFFICE_PATH, '_blank', 'noopener'));
    actions.append(popout);

    head.append(actions);
    view.append(head);

    const hint = el('div', 'office-side-hint',
      'Drag to orbit \u00b7 scroll to zoom \u00b7 click a building to enter.');
    view.append(hint);
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
