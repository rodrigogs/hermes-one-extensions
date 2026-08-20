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
  /* One masthead, 44px, per DESIGN.md §2: mono caps wordmark left, live state
     right. No subtitle — "keep this fork current" only restates the title. */
  .masthead { display:flex; align-items:center; justify-content:space-between;
              gap:16px; min-height:44px; margin:0 0 6px;
              border-bottom:1px solid var(--line); }
  h1 { font:var(--t-label)/1 var(--mono); letter-spacing:.11em; text-transform:uppercase;
       font-weight:600; color:var(--muted); margin:0; }

  /* The live-state pill. Colour is the only thing carrying state here, and it
     obeys the four-hue table — greyscale while the first read is in flight,
     because "checking" is not a health claim. */
  .pill { font:var(--t-label)/1 var(--mono); letter-spacing:.09em; text-transform:uppercase;
          padding:5px 10px; border-radius:999px; border:1px solid var(--line-strong);
          color:var(--muted); white-space:nowrap; }
  .pill.ok   { color:var(--ok-text);   border-color:var(--ok-text); }
  .pill.warn { color:var(--warn-text); border-color:var(--warn-text); }
  .pill.bad  { color:var(--bad-text);  border-color:var(--bad-text); }

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
  /* While the position is unknown, restarting the gateway is not the next step —
     fixing whatever made the read fail is. A filled red button was the loudest
     thing on a screen whose headline admits it knows nothing, which pointed the
     operator at the one action the panel cannot vouch for. Declared after
     button:disabled so it wins on order, like the rule above it. */
  body.unknown button#restart { background:transparent; border-color:var(--line-strong);
                  color:var(--muted); font-weight:400; }

  /* ── sections ──────────────────────────────────────────────────────────────
     The sidebar selects the section, the rail selects the panel — the router's
     idiom, and the reason this panel had a 300px empty column: it registered no
     sidebarView, so the kit deactivated every host view and had nothing to put
     back. Measured live: sidebarWidth 300, zero active views, innerText "".

     Only ever HIDING here, never asserting a display value. A reveal rule would
     have to name one, and the elements involved disagree (#actions is flex, the
     rest are block) — so the natural display survives, and the hidden attribute
     keeps working for the render functions that empty a section. */
  body:not([data-section="position"]) #state,
  body:not([data-section="position"]) #actions,
  body:not([data-section="position"]) #confirm,
  body:not([data-section="position"]) #result,
  body:not([data-section="position"]) #plan,
  body:not([data-section="position"]) #alert,
  body:not([data-section="schedule"]) #jobs,
  body:not([data-section="history"]) #history { display:none; }
  /* A section that carries nothing says so, rather than showing an empty column
     the operator has to interpret. */
  .empty { font-size:var(--t-small); color:var(--muted); margin:12px 0 0; }

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

  /* Rows: a label column and a value column, separated by hairlines. No cards,
     no nesting — structure is space and 1px lines (DESIGN.md §4). */
  .group { margin:30px 0 0; }
  .group > h2 { font:var(--t-label)/1 var(--mono); letter-spacing:.09em;
                text-transform:uppercase; color:var(--muted); font-weight:500;
                margin:0 0 11px; }
  .rows { display:grid; grid-template-columns:auto 1fr; gap:0 18px; }
  .rows > dt, .rows > dd { padding:7px 0; border-top:1px solid var(--line);
                           margin:0; font-size:var(--t-small); }
  .rows > dt { color:var(--muted); }
  .rows > dd { font-family:var(--mono); font-variant-numeric:tabular-nums; }
  .rows > dt:first-of-type, .rows > dt:first-of-type + dd { border-top:0; }
  .sub { display:block; color:var(--muted); font-size:var(--t-small);
         font-family:var(--sans); margin-top:2px; }

  /* The pending-restart notice. --warn, because it is a state of the install
     that needs attention, not a failure. */
  .alert { margin:30px 0 0; padding-left:12px; border-left:1px solid var(--warn-text);
           max-width:68ch; }
  .alert p { margin:0; font-size:var(--t-small); }
  .alert .what { color:var(--warn-text); font-weight:600; }
  .alert .row { margin:11px 0 0; }

  /* History: one line per run, tabular so the columns line up. */
  .runs { display:grid; grid-template-columns:auto auto 1fr; gap:0 16px; }
  .runs > * { padding:6px 0; border-top:1px solid var(--line); font-size:var(--t-small);
              font-family:var(--mono); font-variant-numeric:tabular-nums; }
  .runs > :nth-child(-n+3) { border-top:0; }
  .runs .job { color:var(--muted); }
  .runs .ok { color:var(--ok-text); }
  .runs .bad { color:var(--bad-text); }
  /* The section that is showing is the first thing under the masthead, so it owns
     the gap. .group's own 30px is the spacing BETWEEN stacked groups, which no
     longer applies when only one is up. */
  body[data-section="schedule"] #jobs,
  body[data-section="history"] #history { margin-top:18px; }
</style></head><body data-section="position">
  <!--
    One masthead, then facts. No subtitle: "keep this fork current" restates the
    title, and DESIGN.md §2 forbids a subtitle that carries no fact the title
    cannot imply. The live state sits on the right of the bar, where every other
    panel puts it.
  -->
  <header class="masthead">
    <h1>Fork Keeper</h1>
    <span id="pill" class="pill">checking</span>
  </header>

  <div id="state" role="status" aria-live="polite">
    <p class="headline">Reading the fork's position…</p>
  </div>

  <div class="row" id="actions">
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

  <section id="plan" class="group" hidden>
    <h2>Merge plan</h2>
    <dl id="plan-rows" class="rows"></dl>
  </section>

  <section id="jobs" class="group" hidden>
    <h2>Scheduled</h2>
    <dl id="jobs-rows" class="rows"></dl>
  </section>

  <div id="alert" class="alert" hidden>
    <p><span class="what">Gateway is older than this checkout.</span></p>
    <p id="alert-detail" class="sub"></p>
    <div class="row">
      <button id="restart" class="commit">Restart gateway</button>
    </div>
    <p id="restart-confirm" class="sub" hidden></p>
    <div id="restart-row" class="row" hidden>
      <button id="restart-go" class="commit">Restart now</button>
      <button id="restart-cancel">Cancel</button>
    </div>
  </div>

  <section id="history" class="group" hidden>
    <h2>Recent runs</h2>
    <div id="history-rows" class="runs"></div>
  </section>

<script>
  const $ = (id) => document.getElementById(id);
  const stateEl = $('state'), result = $('result'), confirm = $('confirm');
  let current = null;
  let busy = false;

  /*
   * Everything reaches the DOM through textContent.
   *
   * DESIGN.md §8: "no innerHTML on any path that can carry stored data". This
   * panel carries conflicted file paths and a cron's reason string, both of
   * which originate upstream — attacker-influenceable by the same argument that
   * applies to fact text. The previous version escaped with a hand-rolled
   * three-character replace and assembled markup by concatenation; el() removes
   * the whole class of mistake instead of guarding each site.
   */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* A label/value pair, with an optional second line of context under the value.
     The sub-line is where a count gets its window (DESIGN.md §5: "a count
     without its window is a lie"). */
  function addRow(list, label, value, sub) {
    list.append(el('dt', null, label));
    const dd = el('dd', null, value);
    if (sub) dd.append(el('span', 'sub', sub));
    list.append(dd);
  }

  const short = (sha) => (typeof sha === 'string' ? sha.slice(0, 9) : '');

  /* Months named here rather than by toLocaleDateString(undefined, …), which reads
     the BROWSER's locale and printed "18 de ago." next to labels that all say
     "Last run" and "Next run" — measured on this install. One language per screen;
     when the panel's chrome is translated, this table is what moves with it. */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()];
    const time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return day + ' ' + time;
  }

  /* Relative age, because "11 Aug 18:51" alone does not answer "is this stale".
     Reported in the largest unit that is still honest. */
  function ago(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.round(mins / 60);
    if (hours < 48) return hours + 'h ago';
    return Math.round(hours / 24) + 'd ago';
  }

  /*
   * The next run, computed here rather than trusted from the registry.
   *
   * jobs.json carries the schedule but leaves next_run empty on this install
   * (measured), so the honest options are to compute it or to say "unknown".
   * Computed only for the two shapes the fork-keeper jobs actually use: a fixed
   * daily time, and a fixed interval from the last run. Anything else returns ''
   * and the row says the schedule without inventing a time.
   */
  function nextRun(job) {
    if (!job) return '';
    if (job.next_run) return when(job.next_run);
    const sched = String(job.schedule || '');
    const daily = /^(\\d+)\\s+(\\d+)\\s+\\*\\s+\\*\\s+\\*$/.exec(sched);
    if (daily) {
      const [, min, hour] = daily;
      const next = new Date();
      next.setSeconds(0, 0);
      next.setHours(Number(hour), Number(min), 0, 0);
      if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
      return when(next.toISOString());
    }
    const every = /every\\s+(\\d+)m/.exec(sched);
    if (every && job.last_run) {
      const base = new Date(job.last_run).getTime();
      if (!Number.isNaN(base)) {
        return when(new Date(base + Number(every[1]) * 60000).toISOString());
      }
    }
    return '';
  }

  /* Human wording for a schedule expression. An operator reads "every 48h", not
     "every 2880m", and "0 9 * * *" is not a sentence. */
  function scheduleText(sched) {
    const s = String(sched || '');
    const every = /every\\s+(\\d+)m/.exec(s);
    if (every) {
      const mins = Number(every[1]);
      if (mins % 1440 === 0) return 'every ' + (mins / 1440) + 'd';
      if (mins % 60 === 0) return 'every ' + (mins / 60) + 'h';
      return 'every ' + mins + 'm';
    }
    const daily = /^(\\d+)\\s+(\\d+)\\s+\\*\\s+\\*\\s+\\*$/.exec(s);
    if (daily) {
      return 'daily at ' + String(daily[2]).padStart(2, '0') + ':' + String(daily[1]).padStart(2, '0');
    }
    return s;
  }

  // The ACP-style borrow: the WebUI injects its CSRF token by patching
  // window.fetch, but only in documents it renders itself. This panel is an
  // iframe srcdoc with its own window, so the patched fetch is absent and an
  // unsafe request would arrive with an Origin and no token — a 403. The parent
  // IS a page the WebUI rendered, so borrowing its fetch is what makes the
  // action buttons work, and keeps the token out of this frame entirely.
  const hostFetch = (() => {
    try {
      if (window.parent && window.parent !== window && window.parent.fetch) {
        return window.parent.fetch.bind(window.parent);
      }
    } catch (_) { /* cross-origin parent: nothing to borrow */ }
    return window.fetch.bind(window);
  })();

  async function call(action, method) {
    const ac = new AbortController();
    const slow = action === 'sync' || action === 'dry-run';
    const timer = setTimeout(() => ac.abort(), slow ? 915000 : 30000);
    try {
      const res = await hostFetch('/api/fork-keeper/' + action, {
        method: method || (slow || action === 'restart-gateway' ? 'POST' : 'GET'),
        headers: { 'Accept': 'application/json' },
        credentials: 'same-origin',
        signal: ac.signal,
      });
      // The timer deliberately spans the body read: fetch settles at the response
      // HEADERS, so clearing it here would leave res.json() with no deadline and
      // a server that stalls mid-body would freeze the panel.
      let body = null;
      try { body = await res.json(); } catch (err) {
        if (err && err.name === 'AbortError') throw err;
      }
      if (!res.ok) {
        const why = body && (body.error || body.reason);
        throw new Error(why ? String(why) : 'HTTP ' + res.status + ' from ' + action);
      }
      if (!body || typeof body !== 'object') throw new Error('unreadable response from ' + action);
      return body;
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('timed out waiting for ' + action);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function setPill(word, tone) {
    const pill = $('pill');
    pill.textContent = word;
    pill.className = 'pill' + (tone ? ' ' + tone : '');
  }

  function render(o) {
    const s = (o && o.status) || {};
    current = s;

    /*
     * A status without a numeric commit count is NOT health.
     *
     * Defaulting behind to 0 rendered every unreadable payload — including the
     * bridge's own error objects — as a green "Up to date". DESIGN.md §5:
     * absence has three meanings and a surface must say which. This says
     * "unknown" and names the reason.
     */
    if (typeof s.behind !== 'number' || !Number.isFinite(s.behind)) {
      setPill('unknown', 'warn');
      // Marks the whole document, not just this block: the pending-restart notice
      // lives further down and its filled button must step back while the panel
      // cannot vouch for a reading.
      document.body.classList.add('unknown');
      clear(stateEl).append(
        el('p', 'headline warn', 'Position unknown'),
        el('p', 'note', s.error ? String(s.error)
          : 'The status response carried no commit count, so this panel cannot say how far behind the fork is.'),
      );
      // What to do about it, when the bridge knows. An operator reading "unknown"
      // needs the next move, and the bridge is the only layer that can see why the
      // read failed.
      if (s.fix) stateEl.append(el('p', 'note', String(s.fix)));
      $('dry').disabled = true;
      $('sync').disabled = true;
      hideConfirm();
      renderJobs(o);
      renderHistory(o);
      renderAlert(o);
      return;
    }

    document.body.classList.remove('unknown');
    const behind = s.behind;
    const ahead = s.ahead ?? 0;
    const actionable = behind > 0 && !s.dirty;
    const tone = behind === 0 ? 'ok' : 'warn';
    setPill(behind === 0 ? 'current' : (s.dirty ? 'blocked' : 'behind'), tone);

    const headline = behind === 0
      ? 'Up to date with upstream'
      : behind + ' commit' + (behind === 1 ? '' : 's') + ' behind upstream';

    clear(stateEl);
    stateEl.append(el('p', 'headline ' + tone, headline));

    // The one line the headline cannot imply: divergence is what makes this panel
    // exist at all, because hermes update skips a fork that has local commits.
    if (ahead) {
      stateEl.append(el('p', 'note',
        ahead + ' local commit' + (ahead === 1 ? '' : 's') + ' upstream does not have — '
        + 'which is why hermes update skips this fork: its sync is fast-forward only.'));
    }
    if (s.dirty) {
      stateEl.append(el('p', 'note',
        'The worktree has uncommitted changes. Sync will refuse until it is clean — '
        + 'an update must never decide what happens to unsaved work.'));
    }
    /*
     * Two different freshnesses, and conflating them is how a stale reading reads
     * as a current one. "checked" is when THIS panel last polled. The commit count
     * beside it is only as fresh as the upstream ref the CLI compared against, and
     * sync-fork deliberately does not fetch — the cron fetches before calling it,
     * a panel poll must not touch the network. So an "Up to date" here can be up
     * to one cron interval behind reality, and it now says so instead of implying
     * otherwise.
     */
    const fetched = o && o.upstream_fetched_at;
    const fetchedAge = fetched ? ago(fetched) : '';
    stateEl.append(el('p', 'checked',
      'checked ' + when(new Date().toISOString())
      + (fetchedAge ? ' · upstream ref fetched ' + fetchedAge : '')));

    $('dry').disabled = !actionable || busy;
    $('sync').disabled = !actionable || busy;
    if (!actionable) hideConfirm();

    renderPlan(s);
    renderJobs(o);
    renderAlert(o);
    renderHistory(o);
  }

  function renderPlan(s) {
    const section = $('plan');
    // No plan to show when there is nothing to merge: an empty section is noise,
    // and "0 steps" is not a finding.
    if (!s.behind) { section.hidden = true; return; }
    section.hidden = false;
    const rows = clear($('plan-rows'));
    const steps = s.steps ?? 0;
    addRow(rows, 'Steps', steps + (steps === 1 ? ' step' : ' steps'),
      'the merge stops at each upstream commit that touches a file this fork changed, so a conflict names one commit');
    const risky = s.conflict_prone ?? 0;
    addRow(rows, 'Can conflict',
      risky === 0 ? 'none' : risky + ' of ' + steps,
      risky === 0 ? 'no upstream commit touches a file this fork changed' : undefined);
  }

  function renderJobs(o) {
    const section = $('jobs');
    const sync = (o && o.sync) || {};
    const prs = (o && o.prs) || {};
    // Published for the sidebar row, which cannot count rows it does not draw.
    document.body.dataset.countSchedule = String((sync.name ? 1 : 0) + (prs.name ? 1 : 0));
    if (!sync.name && !prs.name) { section.hidden = true; return; }
    section.hidden = false;
    const rows = clear($('jobs-rows'));

    /*
     * A zero is not an outcome.
     *
     * "merged 0 commits" and "0 rebased, 0 needing attention" were both rendered
     * as if they were findings, so a run that correctly did nothing read like a
     * report of work. Say what happened in words; a count earns its place on
     * screen only when it is non-zero.
     */
    const outcomeOf = (job, verb) => {
      if (job.result) {
        if (job.result !== 'synced') return job.result.replace(/_/g, ' ');
        const n = job.behind;
        if (n === 0) return 'already current, nothing to merge';
        if (typeof n !== 'number') return verb;
        return verb + ' ' + n + ' commit' + (n === 1 ? '' : 's');
      }
      if (job.rebased === undefined) return undefined;
      const done = job.rebased || 0;
      const stuck = job.failed || 0;
      if (!done && !stuck) return 'nothing needed rebasing';
      if (!stuck) return done + ' rebased';
      return done + ' rebased, ' + stuck + ' needing attention';
    };

    /*
     * Both dates used to sit in the same column with the second row's label left
     * EMPTY, so the last run printed directly above the next one with nothing
     * saying which was which — measured on this install, "18 Aug 02:15" over
     * "20 Aug 02:15" and the operator left to infer it from position. Every row
     * names itself now, and the job's own row carries the outcome.
     */
    const describe = (job, label, verb) => {
      if (!job || !job.name) return;
      addRow(rows, label, outcomeOf(job, verb) || 'no result recorded',
        job.enabled === false ? 'paused' : scheduleText(job.schedule));
      addRow(rows, 'Last run', job.last_run
        ? when(job.last_run) + ' · ' + ago(job.last_run)
        : 'never run');
      const next = nextRun(job);
      addRow(rows, 'Next run', next || 'unknown',
        next ? undefined
             : 'the registry leaves next_run empty, and this schedule is not a shape this panel will project');
    };

    describe(sync, 'Upstream sync', 'merged');
    describe(prs, 'Stuck PRs', 'rebased');
  }

  function renderAlert(o) {
    const box = $('alert');
    const pending = o && o.restart_pending;
    // Only a real staleness shows this. The marker is written after a verified
    // merge and cleared by whoever restarts, so its presence IS the finding.
    if (!pending) { box.hidden = true; return; }
    box.hidden = false;
    /*
     * Exactly one filled control (DESIGN.md §4). Both #sync and #restart carry
     * .commit, so a fork that is behind AND carries a pending restart painted
     * TWO — seen in the render once the position became readable, which is the
     * state the panel spends most of its life in.
     *
     * The panel's question is the fork's position, so Sync is the primary action
     * whenever it is offered and the restart steps back to an outline. When the
     * position is unknown neither is primary: the panel cannot vouch for a
     * reading, so it must not paint a restart as the recommended next move
     * either. Hence readable AND not-offered, not merely not-offered.
     *
     * Read off #sync's own disabled state rather than re-deriving actionable
     * here, so the two can never disagree about whether Sync is on offer.
     */
    const readable = !document.body.classList.contains('unknown');
    $('restart').classList.toggle('commit', readable && $('sync').disabled);
    $('alert-detail').textContent =
      'The merge landed on disk but the running process predates it. Restart to pick up '
      + short(pending) + '. The cron cannot do this itself — a scheduled job restarting '
      + 'its own supervisor is the respawn loop Hermes blocks.';
  }

  function renderHistory(o) {
    const section = $('history');
    const runs = (o && o.history) || [];
    document.body.dataset.countHistory = String(runs.length);
    if (!runs.length) { section.hidden = true; return; }
    section.hidden = false;
    const grid = clear($('history-rows'));

    /*
     * Six rows all reading "completed" carry one bit of information between them
     * — measured on this install, exactly that. A failure is what deserves a line
     * of its own; a run that worked deserves to be counted. So every failure is
     * listed, and the successes collapse to one row with the window they cover.
     */
    const shown = runs.slice(0, 12);
    const failed = shown.filter((r) => r.status !== 'completed');
    const done = shown.filter((r) => r.status === 'completed');

    for (const run of failed) {
      grid.append(el('span', 'job', run.job === 'prs' ? 'prs' : 'sync'));
      grid.append(el('span', 'bad', run.status || '?'));
      grid.append(el('span', null, when(run.started_at) + (run.error ? ' · ' + run.error : '')));
    }
    if (done.length) {
      // history arrives newest-first, so the oldest kept run is the last element.
      const newest = done[0], oldest = done[done.length - 1];
      grid.append(el('span', 'job', 'sync + prs'));
      grid.append(el('span', 'ok', done.length === 1 ? 'completed' : done.length + ' completed'));
      grid.append(el('span', null, done.length === 1
        ? when(newest.started_at)
        : when(oldest.started_at) + ' to ' + when(newest.started_at)));
    }
  }

  function hideConfirm() { confirm.hidden = true; document.body.classList.remove('armed'); }

  function arm() {
    const s = current || {};
    const risky = s.conflict_prone ?? 0;
    $('confirm-text').textContent =
      'Merge ' + (s.behind ?? 0) + ' upstream commit(s) into this checkout, in '
      + (s.steps ?? 0) + ' step(s)'
      + (risky ? ', ' + risky + ' of which touch files this fork also changed' : '')
      + '. On conflict the fork is restored and nothing is left half-merged.';
    confirm.hidden = false;
    document.body.classList.add('armed');
    $('go').focus();
  }

  function show(ok, reason, conflicted) {
    clear(result);
    result.append(el('p', 'headline ' + (ok ? 'ok' : 'bad'), ok ? 'Merged' : 'Not merged'));
    if (reason) result.append(el('p', 'detail', reason));
    if (conflicted && conflicted.length) {
      const list = el('ul', 'files');
      for (const f of conflicted) list.append(el('li', null, f));
      result.append(list);
    }
  }

  async function reload() {
    try {
      render(await call('overview'));
    } catch (err) {
      setPill('unreachable', 'bad');
      document.body.classList.add('unknown');
      clear(stateEl).append(el('p', 'note', 'Status unavailable — ' + (err.message || err)));
      $('dry').disabled = true;
      $('sync').disabled = true;
      hideConfirm();
    }
  }

  async function act(action, verb) {
    if (busy) return;
    busy = true;
    hideConfirm();
    $('dry').disabled = true;
    $('sync').disabled = true;
    clear(result).append(el('p', 'detail', verb + '…'));
    try {
      const r = await call(action);
      show(r.ok, r.reason, r.conflicted);
    } catch (err) {
      show(false, String(err.message || err), null);
    } finally {
      // finally, not a statement after the catch: show() writes to the DOM, and a
      // throw from inside the catch would leave busy stuck true — both action
      // buttons dead for the life of the panel.
      busy = false;
    }
    await reload();
  }

  async function restartGateway() {
    $('restart-row').hidden = true;
    $('restart').hidden = false;
    clear(result).append(el('p', 'detail', 'Restarting the gateway…'));
    try {
      const r = await call('restart-gateway');
      clear(result).append(
        el('p', 'headline ' + (r.ok ? 'ok' : 'bad'), r.ok ? 'Gateway restarted' : 'Restart failed'),
        el('p', 'detail', r.reason || ''),
      );
    } catch (err) {
      clear(result).append(
        el('p', 'headline bad', 'Restart failed'),
        el('p', 'detail', String(err.message || err)),
      );
    }
    await reload();
  }

  $('refresh').addEventListener('click', () => void reload());
  $('dry').addEventListener('click', () => act('dry-run', 'Planning'));
  $('sync').addEventListener('click', arm);
  $('go').addEventListener('click', () => act('sync', 'Merging upstream'));
  $('cancel').addEventListener('click', () => { hideConfirm(); $('sync').focus(); });

  // Restarting the gateway takes this interface down with it (the WebUI follows
  // the gateway by PartOf), so it is armed like the merge rather than fired by
  // one click.
  $('restart').addEventListener('click', () => {
    $('restart').hidden = true;
    $('restart-confirm').hidden = false;
    $('restart-confirm').textContent =
      'This restarts the gateway, and this interface restarts with it — the page will '
      + 'reconnect on its own.';
    $('restart-row').hidden = false;
    $('restart-go').focus();
  });
  $('restart-go').addEventListener('click', () => void restartGateway());
  $('restart-cancel').addEventListener('click', () => {
    $('restart-row').hidden = true;
    $('restart-confirm').hidden = true;
    $('restart').hidden = false;
    $('restart').focus();
  });

  void reload();
</script>
</body></html>`;
  }

  /* ── the sidebar ───────────────────────────────────────────────────────────
   *
   * This panel shipped without a sidebarView, and the kit's show() deactivates
   * EVERY .panel-view in the column so exactly one can be active. With nothing of
   * ours to activate, the result was a 300px column containing nothing —
   * measured live: sidebarWidth 300, zero active views, innerText "". The kit's
   * own comment calls that "better an empty rail than a stale list", which is
   * true of the two options it compares and misses the third: give the column
   * something that belongs there.
   *
   * What belongs there is the material that was crowding the status out of the
   * main view. The rail picks the panel, the sidebar picks the section — the
   * router's idiom, and the reason its column reads as part of the host.
   */
  const SECTIONS = [
    ['position', 'Position'],
    ['schedule', 'Schedule'],
    ['history', 'History'],
  ];

  let sideNav = null;
  let sectionObserver = null;

  function frameDoc() {
    const frame = document.querySelector('#' + PANEL_ID + ' iframe');
    if (!frame) return null;
    // srcdoc on the same origin, so this is readable — the try is for the window
    // between element creation and first parse, where it is null.
    try { return frame.contentDocument || null; } catch (_) { return null; }
  }

  function selectSection(name) {
    const doc = frameDoc();
    // The attribute IS the state: the panel's own CSS keys off body[data-section],
    // so there is one source of truth and nothing here to keep in step with it.
    if (doc && doc.body) doc.body.dataset.section = name;
    syncSections();
  }

  function syncSections() {
    if (!sideNav) return;
    const body = (frameDoc() || {}).body;
    const active = (body && body.dataset.section) || 'position';
    for (const button of sideNav.querySelectorAll('.fk-section')) {
      button.classList.toggle('is-on', button.dataset.tab === active);
      button.setAttribute('aria-current', String(button.dataset.tab === active));
      const slot = button.querySelector('.fk-section-n');
      if (!slot) continue;
      // The count comes from the panel, which is the only thing that knows how
      // many rows it drew. Absent until the first render lands, and blank rather
      // than "0" — a zero here would claim a reading the panel has not made yet.
      const n = body && body.dataset['count' + button.dataset.tab.replace(/^./, (c) => c.toUpperCase())];
      slot.textContent = n === undefined || n === '' || n === '0' ? '' : n;
    }
  }

  function watchSections() {
    const doc = frameDoc();
    if (!doc || !doc.body) return;
    syncSections();
    if (sectionObserver) sectionObserver.disconnect();
    // The panel rewrites data-count-* on every render and data-section on every
    // section change; both are attributes on the same node.
    sectionObserver = new MutationObserver(syncSections);
    sectionObserver.observe(doc.body, {
      attributes: true,
      attributeFilter: ['data-section', 'data-count-schedule', 'data-count-history'],
    });
  }

  function buildSidebar(view) {
    // .panel-head mirrors the host's own — the stylesheet pins the measurements —
    // so this column and the conversation list read as one system.
    const head = document.createElement('div');
    head.className = 'panel-head';
    const title = document.createElement('span');
    title.textContent = 'Fork Keeper';
    head.append(title);
    view.append(head);

    const list = document.createElement('nav');
    list.className = 'fk-sections';
    list.setAttribute('aria-label', 'Fork Keeper sections');
    for (const [tab, label] of SECTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fk-section';
      button.dataset.tab = tab;
      button.append(document.createTextNode(label));
      const count = document.createElement('span');
      count.className = 'fk-section-n';
      button.append(count);
      button.addEventListener('click', () => selectSection(tab));
      list.append(button);
    }
    view.append(list);
    sideNav = list;
    syncSections();
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
    // Wired BEFORE srcdoc is assigned: setting srcdoc starts the parse, and a
    // listener added afterwards can miss a load that has already fired for a
    // document with no external resources to wait on.
    frame.addEventListener('load', watchSections);
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
      /*
       * navClass was MISSING, and the kit interpolates it unguarded: the rail
       * button shipped with class "rail-btn nav-tab has-tooltip undefined" and an
       * attribute data-undefined="true" — both read out of the live DOM, on two
       * elements. The kit also uses [data-${navClass}] as its
       * already-installed guard, so every extension that omitted this shared one
       * selector. The three sibling panels all pass it.
       */
      navClass: 'hermes-one-fork-keeper-nav',
      title: 'Fork Keeper',
      iconPath: ICON,
      sidebarView: buildSidebar,
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
