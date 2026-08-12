(() => {
  'use strict';

  /*
   * THESIS: Keeping a fork current is a status you glance at, not a task you go
   *   hunting for. The panel answers one question — is this install behind, and
   *   is it safe to sync — and offers exactly the actions that answer implies.
   * OWN-WORLD: Hermes One's rail and central view. Same panel system as
   *   Sessions, Memory and Office; nothing bespoke.
   * STORY: An operator opens Fork Keeper, sees "42 behind, 3 local commits,
   *   worktree clean", hits Dry run to see the plan, then Sync.
   * FIRST VIEWPORT: The status line. Everything else is subordinate to it.
   * FORM: Rail extension mounting a srcdoc iframe, driven by the same
   *   `hermes sync-fork --json` the CLI and cron use.
   *
   * Why srcdoc and not a sidecar URL: this panel has no server of its own. It
   * talks to the webui's own API with the session's credentials, so a
   * same-origin srcdoc is both sufficient and the only thing framable — the
   * sidecar consoles send X-Frame-Options: DENY.
   */
  const PANEL_ID = 'fork-keeper-panel';
  /*
   * The BARE token, with no `x-` prefix. The kit adds that prefix itself when it
   * builds its class and attribute names (`showing-x-${token}`, `data-panel` of
   * `x-${token}`), so passing `x-fork-keeper` produced `showing-x-x-fork-keeper`
   * on <main> while the reveal logic looked for the single-prefixed form —
   * observed in the live DOM. The router and fact-explorer panels pass `router`
   * and `memory` for the same reason.
   */
  const TOKEN = 'fork-keeper';
  const ICON = '<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/>'
    + '<circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>';

  function panelHtml() {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  /* Tokens come from the host via hermes-theme-bridge.js. The host ships 21
     skins x light/dark, so a copied palette is wrong in 20 of 21 — every value
     below falls back only for the case where the bridge has not painted yet. */
  :root {
    --bg: var(--host-bg, #0a0a0c);
    --text: var(--host-text, #f3f3f6);
    --muted: var(--host-muted, #9a9aa8);
    --line: var(--host-border, #212127);
    --line-strong: var(--host-border2, #33333d);

    --sans: var(--host-font-ui, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
    --mono: var(--host-font-mono, ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, monospace);
    --t-small: var(--host-font-size-sm, 12px);
    --t-body: var(--host-font-size-md, 14px);
    --t-head: 18px;

    --radius: var(--host-radius-md, 8px);
    --radius-sm: var(--host-radius-sm, 4px);
    --focus: 0 0 0 3px var(--host-focus-ring, rgba(243, 243, 246, .22));
    --ease: cubic-bezier(.16, 1, .3, 1);

    /* Pre-mix fallbacks: honest for an engine with no color-mix, where the raw
       hue at least still means the right thing. Derived properly below. */
    --ok-text: var(--host-success, #4ade9b);
    --warn-text: var(--host-warning, #f7b955);
    --bad-text: var(--host-error, #ff6b7d);

    color-scheme: var(--host-color-scheme, dark);
  }

  /* @supports, not the usual declare-twice fallback: a custom property accepts
     any token stream at parse time, so an engine without color-mix() would keep
     the declaration and fail later, at computed-value time. 45% is measured —
     worst case 5.08:1 across the host's full palettes x both polarities, where
     50% gives 4.44:1 and does not clear the 4.5:1 floor. Mixing toward --text
     rather than away from --bg is what makes it polarity-proof. */
  @supports (color: color-mix(in srgb, red 50%, blue)) {
    :root {
      --ok-text:   color-mix(in srgb, var(--host-success, #4ade9b) 45%, var(--host-text, #f3f3f6));
      --warn-text: color-mix(in srgb, var(--host-warning, #f7b955) 45%, var(--host-text, #f3f3f6));
      --bad-text:  color-mix(in srgb, var(--host-error, #ff6b7d) 45%, var(--host-text, #f3f3f6));
    }
  }

  body { margin:0; padding:20px 22px; background:transparent; color:var(--text);
         font:var(--t-body)/1.55 var(--sans); }
  h1 { font-size:var(--t-head); font-weight:600; letter-spacing:-.18px; margin:0 0 14px; }

  /* The question is answered in the first line. No card: one status block and
     one control row do not need a frame. */
  .headline { font-size:var(--t-head); font-weight:600; margin:0 0 2px; }
  .headline.ok   { color:var(--ok-text); }
  .headline.warn { color:var(--warn-text); }
  .headline.bad  { color:var(--bad-text); }
  .state-word { font-size:var(--t-small); text-transform:uppercase;
                letter-spacing:.08em; opacity:.9; }

  /* The one self-referential fact rule 2 allows: this panel's own last read.
     Nothing else on screen can report it, and without it a commit count has no
     age. Dropped below 420px, where the row would wrap — the sibling console
     makes the same trade at its own narrow width. */
  .checked { font-size:var(--t-small); color:var(--muted); margin:6px 0 0; }
  @media (max-width: 420px) { .checked { display:none; } }

  .facts { display:grid; grid-template-columns:auto 1fr; gap:1px 16px;
           margin:12px 0 0; font-variant-numeric:tabular-nums;
           font-size:var(--t-small); }
  .facts dt { color:var(--muted); }
  .facts dd { margin:0; }

  .note { font-size:var(--t-small); color:var(--muted); margin:12px 0 0;
          max-width:68ch; }

  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:20px 0 0; }
  button { font:inherit; min-height:44px; padding:0 16px; border-radius:var(--radius-sm);
           border:1px solid var(--line-strong); background:transparent; color:inherit;
           cursor:pointer; transition:background 120ms var(--ease); }
  button:hover:not(:disabled) { background:color-mix(in srgb, var(--text) 8%, transparent); }
  button:focus-visible { outline:none; box-shadow:var(--focus); }
  /* The committing button is the only FILLED element on the screen — but only
     while it can actually be pressed. Scoped with :not(:disabled) and declared
     before the disabled rule, because a painted-but-inert commit button
     out-shouts the one control that still works (caught in the render, not the
     source). */
  /* Only ONE filled control may be visible (DESIGN.md §4). While the confirm
     row is up, Merge now is the committing button, so the trigger that
     armed it steps back to an outline. */
  body.armed button#sync,
  body:has(#confirm:not([hidden])) button#sync { background:transparent;
                  border-color:var(--line-strong); color:var(--muted); font-weight:400; }
  button.commit:not(:disabled) { background:var(--bad-text); border-color:var(--bad-text);
                  color:var(--host-bg, #0a0a0c); font-weight:600; }
  button.commit:hover:not(:disabled) { filter:brightness(1.08); }
  button:disabled { color:var(--muted); border-color:var(--line); cursor:default; }

  .confirm { margin:16px 0 0; padding-left:12px;
             border-left:1px solid var(--bad-text); max-width:68ch; }
  .confirm p { margin:0 0 10px; font-size:var(--t-small); }

  .result { margin:16px 0 0; }
  .result .headline { font-size:var(--t-body); }
  ul.files { margin:8px 0 0; padding-left:18px; font-family:var(--mono);
             font-size:var(--t-small); }
  .detail { font-family:var(--mono); font-size:var(--t-small); color:var(--muted);
            margin:8px 0 0; white-space:pre-wrap; }
  /* Narrow viewport: the host's drawer can put this panel at ~360px. Buttons
     keep their 44px target and go full-width rather than shrinking below it,
     which is what breaks a thumb target first. */
  @media (max-width: 420px) {
    body { padding:16px 16px; }
    .row { gap:8px; }
    .row button { flex:1 1 100%; }
    .confirm .row button { flex:1 1 auto; }
  }
  [hidden] { display:none; }
</style></head><body>
  <h1>Fork Keeper</h1>

  <div id="state" role="status" aria-live="polite">
    <p class="headline">Checking…</p>
  </div>

  <div class="row">
    <button id="refresh">Refresh</button>
    <button id="dry" disabled>Dry run</button>
    <button id="sync" class="commit" disabled>Sync now</button>
  </div>

  <div id="confirm" class="confirm" hidden>
    <p id="confirm-text"></p>
    <div class="row" style="margin:0">
      <button id="go" class="commit">Merge now</button>
      <button id="cancel">Cancel</button>
    </div>
  </div>

  <div id="result" class="result" role="status" aria-live="polite"></div>

<script>
  const $ = (id) => document.getElementById(id);
  const state = $('state'), result = $('result'), confirm = $('confirm');
  let current = null;

  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  // The WebUI injects its CSRF token by monkey-patching window.fetch, but only
  // in documents it renders itself. This panel runs in an iframe srcdoc, which
  // has its OWN window, so the patched fetch is not here and an unsafe request
  // arrives with an Origin (srcdoc inherits it) and no token — which the server
  // rejects with 403. Verified by running the real _check_csrf against this
  // request shape: token_mismatch. Both action buttons were dead in production.
  //
  // The parent document IS a page the WebUI rendered, so its patched fetch has
  // the token. Borrowing it is the same fix hermes-one-capability-router uses
  // ("borrows the host's token via window.parent"), and it keeps the token out
  // of this frame entirely — we never read it, we just let the parent send.
  const hostFetch = (() => {
    try {
      if (window.parent && window.parent !== window && window.parent.fetch) {
        return window.parent.fetch.bind(window.parent);
      }
    } catch (_) {
      // Cross-origin parent: nothing to borrow. Same-origin is the only case
      // this panel is mounted in, so fall through rather than guess.
    }
    return window.fetch.bind(window);
  })();

  // The panel never runs git. It asks the webui, which runs the same
  // 'hermes sync-fork' the CLI and the cron job run, so all three surfaces
  // agree by construction rather than by three copies of the same logic.
  async function call(action) {
    // A merge can take many minutes on a large backlog, but a request that
    // never settles leaves the UI frozen with no way back. 15 minutes matches
    // the bridge's own sync timeout so the panel does not give up on a merge
    // the server is still doing.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), action === 'status' ? 30000 : 915000);
    let res;
    try {
      res = await hostFetch('/api/fork-keeper/' + action, {
        method: action === 'status' ? 'GET' : 'POST',
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
        signal: ac.signal,
      });
      // The timer deliberately keeps running past this point. fetch() settles as
      // soon as the response HEADERS arrive, so clearing the timeout here left
      // res.json() — which waits for the whole BODY — with no deadline at all: a
      // server that sends headers and then stalls froze the panel permanently,
      // the exact failure the timeout exists to prevent. It is cleared in the
      // outer finally, after the body has been read.
      const body = await readBody(res);
      if (!res.ok) {
        // Read the body even on a non-2xx: the bridge answers 400 (the upstream
        // ref does not resolve), 502 (unparsable CLI output) and 504 (timeout)
        // with an explanation in "error" or "reason". Throwing on the status
        // alone reduced every one of those to "HTTP 400", which tells the
        // operator nothing about what to fix.
        const why = body && (body.error || body.reason);
        throw new Error(why ? String(why)
                            : 'HTTP ' + res.status + ' from /api/fork-keeper/' + action);
      }
      if (!body || typeof body !== 'object') {
        throw new Error('unreadable response from /api/fork-keeper/' + action);
      }
      return body;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('timed out waiting for /api/fork-keeper/' + action);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readBody(res) {
    try {
      return await res.json();
    } catch (err) {
      // An abort mid-body must stay an abort, so call()'s handler can name it a
      // timeout rather than reporting "unreadable response".
      if (err && err.name === 'AbortError') throw err;
      return null;
    }
  }

  function render(s) {
    current = s;

    // Defaulting behind to 0 turned every payload WITHOUT a numeric behind into green
    // "Up to date with upstream / Current" — including the bridge's own error
    // objects ({error: ...}, 502, 503). Fabricating health out of a failed read
    // is the one thing this panel must never do: the operator would stop looking
    // exactly when something is wrong. An unusable status is stated as unknown.
    if (typeof s.behind !== 'number' || !Number.isFinite(s.behind)) {
      const why = s.error ? String(s.error) : 'the status response had no commit count';
      state.innerHTML =
        '<p class="headline warn">Status unknown' +
        ' <span class="state-word">Unknown</span></p>' +
        '<p class="note">' + esc(why) + '</p>';
      $('dry').disabled = true;
      $('sync').disabled = true;
      hideConfirm();
      return;
    }

    const behind = s.behind, ahead = s.ahead ?? 0;
    const actionable = behind > 0 && !s.dirty;
    const tone = behind === 0 ? 'ok' : 'warn';
    const word = behind === 0 ? 'Current' : (s.dirty ? 'Blocked' : 'Behind');

    const headline = behind === 0
      ? 'Up to date with upstream'
      : behind + ' commit' + (behind === 1 ? '' : 's') + ' behind upstream';

    // Only facts that carry a signal. Merge-step counts are diagnostics about
    // this panel's own algorithm, not about the fork, so they stay out of the
    // primary read and appear in the confirm step where they inform a decision.
    const facts = [];
    if (ahead) facts.push(['local commits', ahead + ' not upstream']);
    facts.push(['worktree', s.dirty ? 'uncommitted changes' : 'clean']);

    const clock = (d) => String(d.getHours()).padStart(2, '0') + ':' +
                         String(d.getMinutes()).padStart(2, '0');
    state.innerHTML =
      '<p class="headline ' + tone + '">' + esc(headline) +
      ' <span class="state-word">' + esc(word) + '</span></p>' +
      '<dl class="facts">' +
      facts.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') +
      '</dl>' +
      (s.dirty
        ? '<p class="note">Sync will not run while the worktree is dirty. An update ' +
          'must never decide what happens to unsaved work.</p>'
        : '') +
      // A merge that landed but never reached the running process is the one
      // state a green "Up to date" actively misleads about: the checkout IS
      // current and the gateway is not. The cron cannot restart it (#30719), so
      // this line is the only thing that tells the operator to.
      (s.restart_pending
        ? '<p class="note">Merged code is on disk but the gateway still runs the ' +
          'older build — restart it to pick up ' + esc(String(s.restart_pending).slice(0, 9)) + '.</p>'
        : '') +
      '<p class="checked">checked ' + clock(new Date()) + '</p>';

    // The busy flag wins: a refresh landing mid-merge must not hand the operator a
    // second Sync button while the first merge is still running.
    $('dry').disabled = !actionable || busy;
    $('sync').disabled = !actionable || busy;
    if (!actionable) hideConfirm();
  }

  function hideConfirm() { confirm.hidden = true; document.body.classList.remove('armed'); }

  function arm() {
    const s = current || {};
    const risky = s.conflict_prone ?? 0;
    $('confirm-text').textContent =
      'Merge ' + (s.behind ?? 0) + ' upstream commit(s) into this checkout, in ' +
      (s.steps ?? 0) + ' step(s)' +
      (risky ? ', ' + risky + ' of which touch files this fork also changed' : '') +
      '. On conflict the fork is restored and nothing is left half-merged.';
    confirm.hidden = false;
    document.body.classList.add('armed');
    $('go').focus();
  }

  function show(ok, reason, conflicted) {
    result.innerHTML =
      '<p class="headline ' + (ok ? 'ok' : 'bad') + '">' +
      (ok ? 'Merged' : 'Not merged') + '</p>' +
      '<p class="detail">' + esc(reason || '') + '</p>' +
      (conflicted && conflicted.length
        ? '<ul class="files">' + conflicted.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>'
        : '');
  }

  // True while a dry-run or sync is in flight. Refresh deliberately stays
  // clickable during a long merge, and refresh re-enables the action buttons
  // from the server's status — which would let a second sync-fork start on top
  // of the running one, two processes merging into the same checkout. This flag
  // is what makes render() leave the buttons alone until the action finishes.
  let busy = false;

  async function refresh() {
    try { render(await call('status')); }
    catch (err) {
      // A single muted line, not a framed void: a section with no data is
      // absent or one quiet line, never an empty frame.
      state.innerHTML = '<p class="note">Status unavailable — ' + esc(err.message || err) + '</p>';
      $('dry').disabled = true; $('sync').disabled = true;
      // An armed confirm row outlives the status it was armed against, so
      // "Merge now" could be pressed against a reading the panel has just
      // admitted it cannot make. Disarm.
      hideConfirm();
    }
  }

  async function act(action, verb) {
    if (busy) return;
    busy = true;
    hideConfirm();
    // Refresh stays live: freezing every control during a long merge locks the
    // operator out and yanks focus from under a screen reader.
    $('dry').disabled = true; $('sync').disabled = true;
    result.innerHTML = '<p class="detail">' + verb + '…</p>';
    try {
      const r = await call(action);
      show(r.ok, r.reason, r.conflicted);
    } catch (err) {
      show(false, String(err.message || err), null);
    } finally {
      // finally, not a plain statement after the catch: show() writes innerHTML,
      // so a throw from inside the catch block itself would skip the reset and
      // leave busy stuck true — both action buttons dead for the life of the
      // panel, with no error the operator can act on.
      //
      // Cleared BEFORE the refresh below, so the refresh that follows an action
      // is the one allowed to re-enable the buttons.
      busy = false;
    }
    await refresh();
  }

  $('refresh').addEventListener('click', refresh);
  $('dry').addEventListener('click', () => act('dry-run', 'Planning'));
  $('sync').addEventListener('click', arm);
  $('go').addEventListener('click', () => act('sync', 'Merging upstream'));
  $('cancel').addEventListener('click', () => { hideConfirm(); $('sync').focus(); });
  refresh();
</script>
</body></html>`;
  }

  function mount() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    /*
     * A sibling `main > section.main-view`, exactly like the router and
     * fact-explorer panels. Three details are load-bearing, and getting each of
     * them wrong is why this panel mounted, fetched its status correctly, and
     * still rendered nothing:
     *
     * 1. `main-view` in the class list. The kit's show() reveals panels by
     *    toggling `hidden` on `main > .main-view[data-panel-token]`. Without that
     *    class the selector never matches, so the panel it adopted is never
     *    un-hidden — measured: the iframe had loaded and showed the real status,
     *    while the container stayed hidden.
     * 2. A SIBLING of the host's views, not a child of one. Appending into
     *    `.main-view` put this panel inside a container the host hides by its own
     *    CSS, so it inherited that invisibility no matter what show() did.
     * 3. No `display:none` in inline style. Inline style beats the stylesheet, so
     *    the kit clearing `hidden` could never make it visible again. Visibility
     *    is the kit's to own via `hidden`; adopt() sets that on registration.
     */
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'main-view hermes-panel hermes-one-fork-keeper-panel';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:0;background:transparent;';
    frame.setAttribute('title', 'Fork Keeper');
    frame.srcdoc = panelHtml();
    panel.appendChild(frame);
    (document.querySelector('main') || document.body).appendChild(panel);
    return panel;
  }

  function init() {
    const nav = window.HermesPanelNav;
    if (!nav || typeof nav.register !== 'function') {
      // The kit owns rail insertion, drawer behaviour and hidden-tab rules.
      // Reimplementing any of that here is a second copy that drifts, so this
      // extension simply does not load without it.
      console.warn('[fork-keeper] HermesPanelNav unavailable; panel not registered');
      return;
    }
    const handle = nav.register({
      token: TOKEN,
      label: 'Fork Keeper',
      iconPath: ICON,
      /*
       * adopt THEN show, in that order.
       *
       * The panel element does not exist at register() time, so the first open is
       * what creates and tags it. By then the kit has already run its reveal pass
       * for this token — and adopt() deliberately sets `hidden = true` on the
       * element it adopts, per the host's pattern. The result was a panel that
       * mounted, fetched its status and rendered it correctly while staying
       * invisible: measured `hidden: true, display: none, offsetHeight: 0` with
       * the iframe inside showing "18 commits behind upstream".
       *
       * Re-showing is idempotent, so paying for it on every open is harmless. The
       * capability-router panel does the same, for the same reason.
       */
      onOpen: () => {
        handle.adopt(mount());
        handle.show();
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
