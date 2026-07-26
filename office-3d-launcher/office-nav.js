(() => {
  'use strict';

  /*
   * THESIS: The office is one of three panels in one shell, not a separate app.
   * OWN-WORLD: The host's rail and central view; the 3D city is the artefact and
   *   leads, while the chrome around it obeys the shared panel system.
   * STORY: An operator clicks Office, the city opens where Sessions and Memory
   *   open, and clicking away and back does not reload the scene.
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
  const OFFICE_PATH = '/office/';
  const PANEL_ID = 'office-3d-panel';
  const icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 10h1"/><path d="M14 10h1"/><path d="M9 14h1"/><path d="M14 14h1"/><path d="M10 21v-3h4v3"/></svg>';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = el('section', 'main-view hermes-panel office-3d-panel');
    panel.id = PANEL_ID;
    panel.hidden = true;
    const frame = el('iframe', 'hp-frame');
    frame.title = 'Office 3D';
    frame.dataset.officeFrame = 'true';
    // The scene needs pointer capture for orbit; nothing else is granted.
    frame.setAttribute('allow', 'fullscreen');
    panel.append(frame);
    document.querySelector('main')?.append(panel);
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

  function showPanel() {
    document.querySelectorAll('main > .main-view').forEach((view) => {
      view.hidden = view.id !== PANEL_ID;
    });
  }

  function onOpen() {
    const panel = ensurePanel();
    showPanel();
    load(panel);
  }

  function installRailButton() {
    const rail = document.querySelector('.rail');
    if (!rail) return false;
    if (rail.querySelector('[data-office-3d-launcher]')) return true;
    const button = el('button', 'rail-btn nav-tab has-tooltip office-3d-nav');
    button.type = 'button';
    button.setAttribute('data-office-3d-launcher', 'true');
    button.dataset.tooltip = 'Office 3D';
    button.setAttribute('aria-label', 'Office 3D');
    button.innerHTML = icon; // Trusted static icon only.
    button.addEventListener('click', onOpen);
    rail.insertBefore(button, rail.querySelector('.rail-spacer') || null);
    return true;
  }

  function installSidebarButton() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return false;
    if (nav.querySelector('[data-office-3d-launcher]')) return true;
    const button = el('button', 'nav-tab has-tooltip has-tooltip--bottom office-3d-nav');
    button.type = 'button';
    button.setAttribute('data-office-3d-launcher', 'true');
    button.dataset.label = 'Office';
    button.dataset.tooltip = 'Office 3D';
    button.setAttribute('aria-label', 'Office 3D');
    button.innerHTML = `${icon}<span class="office-3d-nav-label">Office</span>`; // Trusted static markup.
    button.addEventListener('click', onOpen);
    const kanban = nav.querySelector('[data-panel="kanban"]');
    if (kanban?.nextSibling) nav.insertBefore(button, kanban.nextSibling);
    else nav.append(button);
    return true;
  }

  function bootstrap() {
    if (installRailButton() && installSidebarButton()) return;
    const observer = new MutationObserver(() => {
      if (installRailButton() && installSidebarButton()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
