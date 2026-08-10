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
  const TOKEN = 'x-fork-keeper';
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

  // The panel never runs git. It asks the webui, which runs the same
  // 'hermes sync-fork' the CLI and the cron job run, so all three surfaces
  // agree by construction rather than by three copies of the same logic.
  async function call(action) {
    const res = await fetch('/api/fork-keeper/' + action, {
      method: action === 'status' ? 'GET' : 'POST',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' from /api/fork-keeper/' + action);
    return res.json();
  }

  function render(s) {
    current = s;
    const behind = s.behind ?? 0, ahead = s.ahead ?? 0;
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

    state.innerHTML =
      '<p class="headline ' + tone + '">' + esc(headline) +
      ' <span class="state-word">' + esc(word) + '</span></p>' +
      '<dl class="facts">' +
      facts.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') +
      '</dl>' +
      (s.dirty
        ? '<p class="note">Sync will not run while the worktree is dirty. An update ' +
          'must never decide what happens to unsaved work.</p>'
        : '');

    $('dry').disabled = !actionable;
    $('sync').disabled = !actionable;
    if (!actionable) hideConfirm();
  }

  function hideConfirm() { confirm.hidden = true; }

  function arm() {
    const s = current || {};
    const risky = s.conflict_prone ?? 0;
    $('confirm-text').textContent =
      'Merge ' + (s.behind ?? 0) + ' upstream commit(s) into this checkout, in ' +
      (s.steps ?? 0) + ' step(s)' +
      (risky ? ', ' + risky + ' of which touch files this fork also changed' : '') +
      '. On conflict the fork is restored and nothing is left half-merged.';
    confirm.hidden = false;
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

  async function refresh() {
    try { render(await call('status')); }
    catch (err) {
      // A single muted line, not a framed void: a section with no data is
      // absent or one quiet line, never an empty frame.
      state.innerHTML = '<p class="note">Status unavailable — ' + esc(err.message || err) + '</p>';
      $('dry').disabled = true; $('sync').disabled = true;
    }
  }

  async function act(action, verb) {
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
    const host = document.querySelector('.main-view') || document.body;
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'position:absolute;inset:0;display:none;';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:0;background:transparent;';
    frame.setAttribute('title', 'Fork Keeper');
    frame.srcdoc = panelHtml();
    panel.appendChild(frame);
    host.appendChild(panel);
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
      onOpen: () => { handle.adopt(mount()); },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
