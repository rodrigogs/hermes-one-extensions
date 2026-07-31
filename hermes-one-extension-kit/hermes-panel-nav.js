(() => {
  'use strict';

  /*
   * THESIS: An extension panel should be indistinguishable from a native one —
   *   same nav button, same show/hide mechanism, same mobile behaviour. Three
   *   extensions each inventing that produced three subtly different guests.
   * OWN-WORLD: The host's own conventions, borrowed rather than imitated. Every
   *   rule below was read out of hermes-webui/static/{boot,panels}.js and
   *   static/style.css; nothing here is invented.
   * STORY: An operator taps Router in the sidebar. The drawer closes, the panel
   *   fills the view, the button lights up. They tap Kanban. The router goes
   *   away and Kanban appears. On a phone this all still works.
   * FIRST VIEWPORT: No chrome of its own. This file adds behaviour, not pixels.
   * FORM: One global, window.HermesPanelNav, used by the three nav scripts.
   */

  // ── what the host actually does, and why each piece is here ─────────────
  //
  // 1. VISIBILITY. The host does NOT use [hidden]. It puts `showing-<panel>` on
  //    <main> and relies on:
  //        main.main.showing-kanban > #mainKanban { display: flex }
  //    with every other .main-view left at the UA default. My panels used
  //    `hidden` on themselves and ignored `showing-*`, so the two systems did
  //    not compose: tapping a native tab set showing-kanban but never cleared my
  //    panel's `hidden=false`, and my panel — later in the DOM — stayed on top.
  //    Measured live: main.className became "main showing-kanban" while
  //    #hermes-one-capability-router-panel was still the only visible .main-view. Tapping
  //    Kanban showed the Router. The operator was trapped.
  //
  //    So: an extension panel is visible only while its own token is on <main>,
  //    and opening one clears every other token — exactly what switchPanel does.
  //
  // 2. THE MOBILE DRAWER. Below 641px the rail is display:none and the sidebar
  //    is the only navigation, sliding in as `.mobile-open`. The host closes it
  //    after a panel selection via _closeMobileSidebarAfterPanelSelection(),
  //    which itself no-ops on desktop via _isDesktopWidth(). My buttons never
  //    called it, so on a phone the drawer stayed open on top of the panel the
  //    tap had just opened.
  //
  // 3. ACTIVE STATE. The host marks the current tab with
  //        document.querySelectorAll('[data-panel]').forEach(t =>
  //          t.classList.toggle('active', t.dataset.panel === panel))
  //    A button without data-panel is invisible to that loop: mine never lit up,
  //    and never turned off when the operator left. Extension buttons therefore
  //    carry data-panel too, and this module drives the same toggle.
  //
  // All three host helpers are plain script-tag globals on window — verified
  // live: typeof window.closeMobileSidebar === 'function'.

  const PANELS = new Map();          // token -> { onOpen }

  const main = () => document.querySelector('main.main') || document.querySelector('main');

  function isDesktop() {
    // Mirror the host's own threshold rather than guessing one: below 641px the
    // rail is gone and the drawer is the navigation.
    if (typeof window._isDesktopWidth === 'function') {
      try { return window._isDesktopWidth(); } catch (_) { /* fall through */ }
    }
    try { return window.matchMedia('(min-width:641px)').matches; } catch (_) { return true; }
  }

  function closeDrawer() {
    if (!isDesktop() && typeof window.closeMobileSidebar === 'function') {
      try { window.closeMobileSidebar(); } catch (_) { /* the panel still opens */ }
    }
  }

  // Exactly one view showing.
  //
  // This is the pattern the host DOCUMENTS for extensions —
  // hermes-webui/docs/EXTENSIONS.md:551-580 — and going around it is what produced
  // the two defects this rewrite fixes:
  //
  //   For custom pages, prefer adding a dedicated panel and toggling it alongside
  //   the built-in views:
  //       document.querySelectorAll('main > .main-view')
  //         .forEach((view) => { view.hidden = view !== panel; });
  //   If host CSS overrides [hidden], add an extension-scoped rule such as
  //       .my-extension-panel[hidden] { display: none !important; }
  //
  // The previous implementation instead wrote the host's own `showing-<panel>`
  // classes off <main> and put a token of its own on. That composed with the host's
  // CSS but not with its STATE: switchPanel keeps `_currentPanel`, and clearing the
  // class without telling it left the two disagreeing. Measured consequences:
  //   * Desktop: tapping the tab you came FROM did nothing — switchPanel's
  //     `else if (prevPanel === nextPanel)` branch (panels.js:382) collapsed the
  //     sidebar and returned false, so the panel stayed and the click was swallowed.
  //   * Mobile: opening the drawer runs _syncMobileSidebarPanelFromMainView, which
  //     re-toggles .active from that same stale _currentPanel — which our
  //     MutationObserver read as "the host took the view" and tore the panel down.
  //     Merely LOOKING at the menu replaced the panel with chat.
  //
  // The doc's own advice — "preserve built-in navigation behavior and restore any
  // view state you change" — is the rule both defects broke. So: [hidden] as
  // documented, and the host's navigation is DRIVEN rather than overwritten.
  function show(token) {
    const host = main();
    if (!host) return;
    // Route through the host so its state machine stays coherent: this clears its
    // own showing-* classes, sets _currentPanel, runs its teardown (the Kanban SSE
    // stream and the logs poll were both left running before), and syncs the
    // titlebar. 'chat' is the correct parking state because it is the host's
    // no-token default, and our CSS suppresses it while an extension token is up.
    if (typeof window.switchPanel === 'function' && hostPanel() !== 'chat') {
      try { window.switchPanel('chat', { bypassSettingsGuard: true }); } catch (_) { /* fall through */ }
    }
    for (const t of PANELS.keys()) host.classList.toggle(`showing-x-${t}`, t === token);
    // Toggle `hidden` on OUR panels only.
    //
    // The doc's snippet hides every main-view, including the host's, which is right
    // for the single-extension case it illustrates but wrong here: the host governs
    // its own views by CLASS (main.main.showing-kanban > #mainKanban{display:flex})
    // and never touches their `hidden` attribute. So a `hidden` we set on #mainKanban
    // is one nobody ever clears, and our own
    //     main > .main-view[hidden] { display: none !important }
    // then outranks the host's rule permanently — measured: after returning to
    // Kanban, _currentPanel was 'kanban' and showing-kanban was on <main>, yet
    // #mainKanban computed display:none and zero height. An empty screen.
    //
    // The host's views do not need hiding by us anyway: switchPanel('chat') above
    // already moved its token, so its own CSS has stopped matching them. Suppressing
    // chat — its no-token default — is the shared stylesheet's job.
    document.querySelectorAll('main > .main-view[data-panel-token]').forEach((view) => {
      view.hidden = view.dataset.panelToken !== token;
    });
    document.querySelectorAll('[data-panel]').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.panel === `x-${token}`);
    });

    // The sidebar is a stack of .panel-view siblings; the host shows exactly one
    // by class. Extensions that register a sidebarView get the same treatment, so
    // the drawer stops showing the chat conversation list behind an open Office.
    // Extensions without one fall through to no sidebar view at all, which is
    // still correct: better an empty rail than a stale list from another panel.
    document.querySelectorAll('.sidebar .panel-view').forEach((view) => {
      view.classList.toggle('active', view.dataset.panelToken === token);
    });

    // aria-expanded on the rail mirrors "this panel owns the sidebar". The host
    // syncs it via _syncSidebarAria for its own tabs; ours are invisible to that
    // pass, so a stale true would stay on Chat while Office is open.
    document.querySelectorAll('.rail [data-panel], .sidebar-nav [data-panel]').forEach((tab) => {
      if (tab.hasAttribute('aria-expanded')) {
        tab.setAttribute('aria-expanded', String(tab.dataset.panel === `x-${token}`));
      }
    });
  }

  // What the host believes it is showing. Read-only: the value is a private `let`
  // in panels.js and assigning it would break on any host update — and the host
  // ships updates (the shell was offering 11 while this was written).
  // The host's own collapse gate (_isDesktopWidth, min-width:641px). Below it the
  // sidebar is an overlay and collapsing it would strand the operator with no rail.
  function isDesktopWidth() {
    try { return window.matchMedia('(min-width:641px)').matches; } catch (_) { return true; }
  }

  function hostPanel() {
    try { return typeof _currentPanel === 'string' ? _currentPanel : null; } catch (_) { return null; }
  }

  // Stand down when the host takes the view back.
  //
  // Wrapping switchPanel rather than watching a class: switchPanel is the single
  // funnel for every host navigation — the rail and sidebar buttons are inline
  // `onclick="switchPanel('kanban',{fromRailClick:true})"` (index.html:157), and
  // verified live that window.switchPanel is the same binding those resolve, so one
  // wrapper sees all of them. The MutationObserver this replaces could not tell
  // "the operator navigated" from "the host re-synced .active off a stale
  // _currentPanel", and the second case is what destroyed the panel on mobile.
  let wrapped = false;
  function watchHost() {
    if (wrapped || typeof window.switchPanel !== 'function') return;
    const original = window.switchPanel;
    window.switchPanel = function hermesPanelAwareSwitchPanel(...args) {
      // Was an extension panel on screen when this navigation started?
      const wasHeld = held();
      // Release BEFORE the host runs, so its own [hidden] toggles land on a view
      // list we are no longer claiming — and so prevPanel/nextPanel logic inside it
      // sees a coherent world.
      release();
      // show() moves the host's token to 'chat' so its CSS stops matching its own
      // views, which leaves _currentPanel === 'chat' for as long as our panel is up.
      // The host's rail then reads a click on Chats as a click on the panel that is
      // already current and collapses the sidebar instead of navigating —
      // measured on a fresh load: 300px, Office, then 1px on returning to Chats.
      //
      // Leaving an extension panel is a navigation, never a collapse, so the
      // double-duty branch is suppressed for exactly that transition. Dropping
      // fromRailClick is what does it; every other opt is passed through.
      if (wasHeld && args[1] && args[1].fromRailClick) {
        args[1] = { ...args[1], fromRailClick: false };
      }
      return original.apply(this, args);
    };
    wrapped = true;
  }

  /** True when one of our panels currently owns the main view. */
  function held() {
    const host = main();
    if (!host) return false;
    for (const t of PANELS.keys()) {
      if (host.classList.contains(`showing-x-${t}`)) return true;
    }
    return false;
  }

  function release() {
    const host = main();
    if (!host) return;
    let held = false;
    for (const t of PANELS.keys()) {
      if (host.classList.contains(`showing-x-${t}`)) held = true;
      host.classList.remove(`showing-x-${t}`);
    }
    if (!held) return;
    document.querySelectorAll('main > .main-view[data-panel-token]').forEach((view) => {
      view.hidden = true;
    });
    document.querySelectorAll('[data-panel^="x-"]').forEach((tab) => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.sidebar .panel-view[data-panel-token]').forEach((view) => {
      view.classList.remove('active');
    });
    // Reinstate the host's sidebar view. show() cleared every .panel-view so ours
    // could be the only active one; the host only re-activates its own inside
    // switchPanel, and release() can be reached without one (a rail click on the
    // panel that is already current). Read the token the host still believes is
    // current and restore that view by its id convention: panel<Token>.
    const token = hostPanel();
    if (token) {
      const id = 'panel' + token.charAt(0).toUpperCase() + token.slice(1);
      const hostView = document.getElementById(id);
      if (hostView) hostView.classList.add('active');
      document.querySelectorAll(`[data-panel="${token}"]`).forEach((tab) => {
        tab.classList.add('active');
        if (tab.hasAttribute('aria-expanded')) tab.setAttribute('aria-expanded', 'true');
      });
    }
    // Hand aria-expanded back: the host's own _syncSidebarAria runs on its next
    // switchPanel and will set the truthful value for whichever tab it activated.
    document.querySelectorAll('.rail [data-panel^="x-"], .sidebar-nav [data-panel^="x-"]').forEach((tab) => {
      if (tab.hasAttribute('aria-expanded')) tab.setAttribute('aria-expanded', 'false');
    });
  }

  const ICON_STYLE = 'width="20" height="20" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" '
    + 'stroke-linejoin="round" aria-hidden="true"';

  /**
   * Register an extension panel and install its nav buttons.
   *
   * @param {object} spec
   * @param {string} spec.token      short id, e.g. 'router' (becomes data-panel="x-router")
   * @param {string} spec.label      the short name shown under the sidebar icon
   * @param {string} [spec.title]    the full name for the tooltip and aria-label;
   *                                 defaults to label. They differ where the short
   *                                 form would be ambiguous next to a host tab.
   * @param {string} spec.iconPath   raw <path>/<circle> markup, no <svg> wrapper
   * @param {string} spec.navClass   the surface's own nav class, e.g. 'hermes-one-capability-router-nav'
   * @param {Function} spec.onOpen   called when the panel is opened
   * @param {string} [spec.after]    data-panel value to insert after; defaults to 'kanban'
   * @returns {{open: Function, adopt: Function}} adopt(el) tags a panel element
   *   with this token so show() can find it.
   */
  function register(spec) {
    PANELS.set(spec.token, { onOpen: spec.onOpen });
    const icon = `<svg ${ICON_STYLE}>${spec.iconPath}</svg>`;

    const open = () => {
      // Order matters: close the drawer first so the panel is not painted behind
      // it, then show, then let the surface load. Verified on a 390px viewport.
      closeDrawer();
      show(spec.token);
      try { spec.onOpen(); } catch (error) { console.error(`[${spec.token}] open failed`, error); }
    };

    // The host hides tabs listed in hidden_tabs by putting .nav-tab-hidden on every
    // [data-panel] element — once, at boot. Our buttons are created after that pass,
    // so they were born visible no matter what the operator had chosen: measured with
    // hidden_tabs ["x-office"], the rail button had no .nav-tab-hidden and rendered
    // display:flex, and re-running the host's pass by hand hid it immediately.
    //
    // Calling the host's own function rather than reimplementing the rule: it owns
    // _ALWAYS_VISIBLE_TABS and the "active tab became hidden" fallback, and a second
    // copy of that logic here is one that drifts. Both are top-level declarations in
    // a classic script, so they are on window; guarded because a host that stops
    // exposing them must not break panel registration.
    const applyHostTabVisibility = () => {
      try {
        if (typeof window._applyTabVisibility === 'function'
            && typeof window._getHiddenTabs === 'function') {
          window._applyTabVisibility(window._getHiddenTabs());
        }
      } catch (error) {
        console.warn('[hermes-panel-nav] could not apply the host tab visibility', error);
      }
    };

    const build = (extraClass, withLabel) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${extraClass} ${spec.navClass}`;
      // data-panel is what makes the host's active-state loop see this button at
      // all. The x- prefix keeps it out of the host's own MAIN_VIEW_PANELS list,
      // so switchPanel never tries to open a panel-view that does not exist.
      button.dataset.panel = `x-${spec.token}`;
      const title = spec.title || spec.label;
      button.dataset.label = spec.label;
      button.dataset.tooltip = title;
      button.setAttribute('aria-label', title);
      button.setAttribute(`data-${spec.navClass}`, 'true');
      button.innerHTML = withLabel
        ? `${icon}<span class="${spec.navClass}-label">${spec.label}</span>`
        : icon;
      // Re-clicking the ACTIVE icon collapses the sidebar, which is what the rail
      // does for every host panel (panels.js: prevPanel === nextPanel -> collapse).
      // Without this the extension panels were the only ones whose rail icon had no
      // second gesture — measured, the second click did nothing at all.
      button.addEventListener('click', () => {
        if (button.classList.contains('active')
            && typeof window.toggleSidebar === 'function'
            && isDesktopWidth()) {
          window.toggleSidebar();
          return;
        }
        open();
      });
      return button;
    };

    // A sidebar view is optional. When an extension supplies one, mount it as a
    // sibling .panel-view so the host's own show-exactly-one convention applies to
    // it, tagged with our token so show()/release() can find it.
    const installSidebarView = () => {
      if (typeof spec.sidebarView !== 'function') return;
      const sidebar = document.querySelector('.sidebar');
      if (!sidebar) return;
      if (sidebar.querySelector(`.panel-view[data-panel-token="${spec.token}"]`)) return;
      const view = document.createElement('div');
      view.className = 'panel-view';
      view.dataset.panelToken = spec.token;
      try { spec.sidebarView(view); } catch (error) {
        console.error(`[${spec.token}] sidebarView failed`, error);
        return;
      }
      const handle = sidebar.querySelector('.resize-handle');
      if (handle) sidebar.insertBefore(view, handle);
      else sidebar.append(view);
    };

    const anchor = spec.after || 'kanban';

    const installRail = () => {
      const rail = document.querySelector('.rail');
      if (!rail) return false;
      if (rail.querySelector(`[data-${spec.navClass}]`)) return true;
      const button = build('rail-btn nav-tab has-tooltip', false);
      // Beside the host's own tabs, in the same relative place as the sidebar
      // copy — not appended at the end, which is how Memory graph ended up after
      // Settings while its two siblings sat after Kanban.
      const ref = rail.querySelector(`[data-panel="${anchor}"]`);
      if (ref && ref.nextSibling) rail.insertBefore(button, ref.nextSibling);
      else rail.insertBefore(button, rail.querySelector('.rail-spacer') || null);
      applyHostTabVisibility();
      return true;
    };

    const installSidebar = () => {
      const nav = document.querySelector('.sidebar-nav');
      if (!nav) return false;
      if (nav.querySelector(`[data-${spec.navClass}]`)) return true;
      const button = build('nav-tab has-tooltip has-tooltip--bottom', true);
      const ref = nav.querySelector(`[data-panel="${anchor}"]`);
      if (ref && ref.nextSibling) nav.insertBefore(button, ref.nextSibling);
      else nav.append(button);
      applyHostTabVisibility();
      return true;
    };

    const bootstrap = () => {
      // watchHost AFTER installing, never before: it looks for one of our own
      // buttons to observe, so on the first call there is nothing to find. Called
      // first, it bailed silently — and when install then succeeded immediately,
      // bootstrap returned and the observer was never created at all. The panel
      // opened fine and then never stood down for a host tab, which is the exact
      // bug this module exists to fix, reintroduced by ordering.
      const installed = installRail() && installSidebar();
      installSidebarView();
      watchHost();
      if (installed) return;
      const observer = new MutationObserver(() => {
        if (installRail() && installSidebar()) {
          installSidebarView();
          watchHost();
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
      bootstrap();
    }

    return {
      open,
      show: () => show(spec.token),
      // A surface builds its own panel element (it owns the frame and the error
      // state); this is how that element gets tagged so show() can find it.
      adopt: (element) => {
        element.dataset.panelToken = spec.token;
        // Hidden on adoption, per the host's documented pattern: a panel that
        // announces itself before the operator asks for it would cover whatever
        // they were reading.
        element.hidden = true;
        return element;
      },
    };
  }

  window.HermesPanelNav = { register, isDesktop, closeDrawer };
})();
