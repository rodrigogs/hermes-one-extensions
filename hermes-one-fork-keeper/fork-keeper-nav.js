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
  :root { color-scheme: light dark; }
  body { margin:0; font:13px/1.5 ui-sans-serif,system-ui,sans-serif;
         background:transparent; color:inherit; padding:18px 20px; }
  h1 { font-size:15px; margin:0 0 2px; font-weight:600; }
  .sub { opacity:.6; font-size:12px; margin-bottom:18px; }
  .state { border:1px solid currentColor; border-radius:8px; padding:14px 16px;
           opacity:.98; margin-bottom:14px; }
  .state.ok    { border-color:#3fa45b; }
  .state.warn  { border-color:#d19a2f; }
  .state.err   { border-color:#c2544d; }
  .headline { font-weight:600; margin-bottom:6px; }
  .facts { display:grid; grid-template-columns:auto 1fr; gap:2px 14px;
           font-variant-numeric:tabular-nums; font-size:12px; opacity:.85; }
  .facts dt { opacity:.65; }
  .note { font-size:12px; opacity:.7; margin-top:10px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0 0; }
  button { font:inherit; padding:7px 13px; border-radius:6px;
           border:1px solid currentColor; background:transparent; color:inherit;
           cursor:pointer; opacity:.9; }
  button:hover:not(:disabled) { opacity:1; }
  button:disabled { opacity:.4; cursor:default; }
  pre { white-space:pre-wrap; font-size:12px; margin:14px 0 0;
        padding:12px; border-radius:6px; background:rgba(127,127,127,.12);
        max-height:34vh; overflow:auto; }
  .hidden { display:none; }
</style></head><body>
  <h1>Fork Keeper</h1>
  <div class="sub">Merge upstream into this fork. <code>hermes update</code>
    skips a diverged fork by design — its sync is fast-forward only.</div>

  <div id="state" class="state"><div class="headline">Checking…</div></div>

  <div class="row">
    <button id="refresh">Refresh</button>
    <button id="dry" disabled>Dry run</button>
    <button id="sync" disabled>Sync now</button>
  </div>

  <pre id="out" class="hidden"></pre>

<script>
  const $ = (id) => document.getElementById(id);
  const out = $('out');

  function say(text) {
    out.classList.remove('hidden');
    out.textContent = text;
  }

  // The panel never shells out itself. It asks the webui, which runs the same
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
    const box = $('state');
    const behind = s.behind ?? 0;
    const actionable = behind > 0 && !s.dirty;

    box.className = 'state ' + (s.dirty ? 'warn' : behind ? 'warn' : 'ok');
    const headline = behind === 0
      ? 'Up to date with upstream.'
      : (s.diverged
          ? behind + ' behind, ' + (s.ahead ?? 0) + ' local commit(s) upstream lacks.'
          : behind + ' commit(s) behind upstream.');

    const facts = [
      ['behind', behind],
      ['local commits', s.ahead ?? 0],
      ['merge steps', s.steps ?? 0],
      ['risky steps', s.conflict_prone ?? 0],
      ['worktree', s.dirty ? 'dirty' : 'clean'],
    ].map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');

    let note = '';
    if (s.dirty) {
      note = '<div class="note">Uncommitted changes present. Sync refuses until the '
           + 'worktree is clean — an update must never decide what happens to unsaved work.</div>';
    } else if (s.conflict_prone) {
      note = '<div class="note">' + s.conflict_prone + ' upstream commit(s) touch files this '
           + 'fork also changed. Those are merged one at a time so a conflict names a single '
           + 'commit; on conflict the fork is restored and nothing is left half-merged.</div>';
    }

    box.innerHTML = '<div class="headline">' + headline + '</div>'
                  + '<dl class="facts">' + facts + '</dl>' + note;

    $('dry').disabled = !actionable;
    $('sync').disabled = !actionable;
  }

  async function refresh() {
    try { render(await call('status')); }
    catch (err) { $('state').className = 'state err';
                  $('state').innerHTML = '<div class="headline">Status unavailable</div>';
                  say(String(err.message || err)); }
  }

  async function act(action, label) {
    ['refresh', 'dry', 'sync'].forEach((id) => { $(id).disabled = true; });
    say(label + '…');
    try {
      const r = await call(action);
      say((r.ok ? 'OK — ' : 'Did not complete — ') + (r.reason || '')
        + (r.conflicted && r.conflicted.length
            ? '\\n\\nconflicted:\\n  ' + r.conflicted.join('\\n  ') : ''));
    } catch (err) {
      say(String(err.message || err));
    }
    $('refresh').disabled = false;
    await refresh();
  }

  $('refresh').addEventListener('click', refresh);
  $('dry').addEventListener('click', () => act('dry-run', 'Planning'));
  $('sync').addEventListener('click', () => act('sync', 'Merging upstream'));
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
