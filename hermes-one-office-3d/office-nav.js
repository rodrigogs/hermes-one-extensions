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
    // onOpen's sync runs before this document exists, so the first collapse state
    // would be missed on a cold open — and it also has to re-apply after a
    // reload, which throws the class away with the old document.
    frame.addEventListener('load', syncCollapsed);
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


  // The Office sidebar view.
  //
  // The host shows exactly one .panel-view; without one of our own the drawer
  // kept displaying the chat conversation list behind an open Office. Above
  // 641px this view is not what the operator sees in that column — the panel's
  // own roster fills the track and this sidebar is collapsed (see office-nav.css)
  // — so all this holds is the title the host expects and the camera hint, which
  // is what the drawer shows at the widths where the roster is a sheet instead.
  function buildSidebar(view) {
    const head = el('div', 'panel-head');
    const title = document.createElement('span');
    title.textContent = 'Office';
    head.append(title);

    /* No actions here. Reload-scene and pop-out used to live in this head; above
       641px this whole view now sits inside a collapsed column, so they were
       unreachable, and below it the drawer has to be pulled open to reach them.
       They moved into the panel's own header, which is visible at every width.
       Duplicating them in both places would have meant two controls for one
       action, one of them usually invisible. */
    view.append(head);

    const hint = el('div', 'office-side-hint',
      'Arraste para orbitar, role para dar zoom, clique num pr\u00e9dio '
      + 'para entrar. A equipe e os dados da frota ficam no painel ao lado.');
    view.append(hint);
  }

  // Collapsing the roster, from the host's own control.
  //
  // Every host panel collapses its sidebar by clicking the active rail icon, and
  // .layout.sidebar-collapsed is how the host records that. Two things had to be
  // true for the Office to honour the same gesture, and neither was:
  //
  //   * The extension icons had no second click at all — the kit only ever called
  //     open(). Measured: clicking an already-active Office icon did nothing. The
  //     kit now performs the host's own collapse for its own buttons.
  //   * The roster lives inside the frame, where .layout.sidebar-collapsed cannot
  //     reach it, so even a working toggle would have left it on screen while the
  //     host column it stands in for was already gone.
  //
  // This closes the second half: the state crosses the frame boundary as
  // .roster-collapsed, so the gesture the operator already knows keeps working and
  // the city takes the full width.
  //
  // Same-origin, so a direct call rather than postMessage; wrapped because the
  // frame is cross-origin the moment anyone reconfigures where Office is served.
  let collapseObserver = null;

  function syncCollapsed() {
    const layout = document.querySelector('.layout');
    const frame = document.querySelector('[data-office-frame]');
    if (!layout || !frame) return;
    const collapsed = layout.classList.contains('sidebar-collapsed');
    try {
      const doc = frame.contentDocument;
      const app = doc && doc.querySelector('.office-app');
      if (app) app.classList.toggle('roster-collapsed', collapsed);
    } catch (error) {
      // Cross-origin: the roster keeps its own header toggle, which is never hidden
      // when this sync cannot run.
    }
  }

  function watchCollapsed() {
    if (collapseObserver) return;
    const layout = document.querySelector('.layout');
    if (!layout) return;
    collapseObserver = new MutationObserver(syncCollapsed);
    collapseObserver.observe(layout, { attributes: true, attributeFilter: ['class'] });
  }

  function onOpen() {
    const panel = ensurePanel();
    if (nav) nav.show();
    load(panel);
    watchCollapsed();
    syncCollapsed();
  }

  if (!window.HermesPanelNav) {
    console.error('[hermes-one-office-3d] Hermes One Extension Kit did not load; the '
      + 'Office button cannot be installed. Check that "hermes-one-extension-kit" is listed '
      + 'BEFORE "hermes-one-office-3d" in extensions.json.');
    return;
  }

  nav = window.HermesPanelNav.register({
    token: 'office',
    label: 'Office',
    title: 'Office 3D',
    iconPath: ICON,
    navClass: 'hermes-one-office-3d-nav',
    onOpen,
    sidebarView: buildSidebar,
  });
})();
