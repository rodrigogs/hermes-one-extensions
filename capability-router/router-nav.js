(() => {
  'use strict';

  /*
   * THESIS: Put the router console where an operator already works, and where it
   *   can actually write.
   * OWN-WORLD: The host's rail and main-view; the console owns its own world once
   *   mounted. This file contributes navigation and a frame, nothing visual.
   * STORY: An operator clicks Router in the rail, the console opens in the same
   *   panel that holds Sessions and Memory, and editing works there.
   * FIRST VIEWPORT: The console's own — this file adds no chrome above it.
   * FORM: Existing Hermes One rail/sidebar extension, not a new application route.
   */
  // Capability Router — Hermes One extension.
  //
  // This file used to carry a five-tab UI that duplicated every read the console
  // already does, which meant two surfaces to keep true and only one of them
  // actually maintained. It is now a frame around the single console at /console.
  //
  // Mounting matters for more than tidiness: the WebUI derives a CSRF token from
  // the session and injects it only into pages it renders itself (/, /index.html,
  // /session/*). A console served by the sidecar therefore never receives one and
  // can read but never write. Mounted under the host document it is same-origin,
  // reaches the consented sidecar proxy with cookies, and borrows the host's
  // token via window.parent. Verified end to end: POST /plan answers 200 from
  // inside this frame and 403 from a standalone tab.
  const EXT_ID = 'capability-router';
  const SIDE = `/api/extensions/${EXT_ID}/sidecar`;
  const PANEL_ID = 'capability-router-panel';
  const icon =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 6h4a2 2 0 0 1 2 2v1"/><path d="M9 18h4a2 2 0 0 0 2-2v-1"/></svg>';

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = el('section', 'main-view hermes-panel capability-router-panel');
    panel.id = PANEL_ID;
    panel.hidden = true;
    // srcdoc, not src: the sidecar sends X-Frame-Options DENY and
    // frame-ancestors 'none', so the served page cannot be framed by URL. srcdoc
    // inherits this document's origin, which is the whole point — it is what lets
    // the console reach the proxy with cookies and read the host's token.
    const frame = el('iframe', 'hp-frame');
    frame.title = 'Capability Router console';
    frame.dataset.consoleFrame = 'true';
    panel.append(frame);
    document.querySelector('main')?.append(panel);
    return panel;
  }

  // Load the console shell once; reopening the panel must not refetch it or throw
  // away the operator's place in it.
  async function load(panel) {
    const frame = panel.querySelector('[data-console-frame]');
    if (!frame || frame.dataset.loaded === 'true') return;
    try {
      const response = await fetch(`${SIDE}/console`, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
      frame.srcdoc = await response.text();
      frame.dataset.loaded = 'true';
    } catch (error) {
      renderError(panel, error);
    }
  }

  // The console reports on the router; only this file can report that the console
  // itself could not be fetched.
  function renderError(panel, error) {
    panel.querySelector('[data-console-frame]')?.remove();
    let message = panel.querySelector('.hp-error');
    if (!message) {
      message = el('div', 'hp-error');
      message.setAttribute('role', 'alert');
      message.setAttribute('aria-live', 'assertive');
      panel.append(message);
    }
    const code = error?.status || '?';
    message.textContent = code === 403
      ? 'Sidecar proxy not consented. Approve it in Settings → Extensions, then refresh.'
      : code === 503
        ? 'Sidecar token file missing (503). Start the router-sidecar service, then refresh.'
        : `Could not reach the router sidecar (HTTP ${code}).`;
  }

  function showPanel() {
    document.querySelectorAll('main > .main-view').forEach((view) => { view.hidden = view.id !== PANEL_ID; });
  }

  function onOpen() {
    const panel = ensurePanel();
    showPanel();
    load(panel);
  }

  function installRailButton() {
    const rail = document.querySelector('.rail');
    if (!rail) return false;
    if (rail.querySelector('[data-capability-router]')) return true;
    const button = el('button', 'rail-btn nav-tab has-tooltip capability-router-nav');
    button.type = 'button'; button.dataset.capabilityRouter = 'true'; button.dataset.tooltip = 'Capability Router';
    button.setAttribute('aria-label', 'Capability Router');
    button.innerHTML = icon; // Trusted static icon only.
    button.addEventListener('click', onOpen);
    rail.insertBefore(button, rail.querySelector('.rail-spacer') || null);
    return true;
  }

  function installSidebarButton() {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return false;
    if (nav.querySelector('[data-capability-router]')) return true;
    const button = el('button', 'nav-tab has-tooltip has-tooltip--bottom capability-router-nav');
    button.type = 'button'; button.dataset.capabilityRouter = 'true'; button.dataset.label = 'Router'; button.dataset.tooltip = 'Capability Router';
    button.setAttribute('aria-label', 'Capability Router');
    button.innerHTML = `${icon}<span class="capability-router-nav-label">Router</span>`; // Trusted static markup only.
    button.addEventListener('click', onOpen);
    const kanban = nav.querySelector('[data-panel="kanban"]');
    if (kanban?.nextSibling) nav.insertBefore(button, kanban.nextSibling); else nav.append(button);
    return true;
  }

  function bootstrap() {
    if (installRailButton() && installSidebarButton()) return;
    const observer = new MutationObserver(() => { if (installRailButton() && installSidebarButton()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  else bootstrap();
})();
