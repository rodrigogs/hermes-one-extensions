// The Fork Keeper panel's rendering rules.
//
// This file exists because of four defects that source review passed and only a
// render or a measurement exposed. Three of them were caught after the panel had
// already shipped:
//
//   1. `button.commit` was declared AFTER `button:disabled` with higher
//      specificity, so a disabled commit button stayed fully painted and
//      out-shouted the only control that still worked.
//   2. Arming the confirm row put TWO filled controls on screen at once — the
//      trigger that had already done its job, and the button that actually
//      commits — at the exact moment the operator decides whether to mutate a
//      production checkout. DESIGN.md §4 allows exactly one.
//   3. The error path wrote a lone headline into a framed box, producing a
//      1240px frame holding two words: the "framed void" rule 1 forbids.
//   4. State was signalled by border colour alone, so colour was the only
//      channel rather than reinforcement (DESIGN.md §3).
//
// Each is a property of the markup this module generates, so they are pinned here
// instead of being re-found by eye on the next edit.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const path = require('node:path');

// Anchored to __dirname for the same reason the panel-nav suite is: a bare
// filename resolves against wherever the runner was launched, which makes the
// suite green only when someone happens to cd here first. Both layouts exist —
// tests/ inside the deployed extension, or side by side in a checkout.
const SOURCE_CANDIDATES = [
  path.join(__dirname, '..', 'fork-keeper-nav.js'),
  path.join(__dirname, 'fork-keeper-nav.js'),
];
const sourcePath = SOURCE_CANDIDATES.find((p) => fs.existsSync(p)) || SOURCE_CANDIDATES[0];
const source = fs.readFileSync(sourcePath, 'utf8');

// The panel HTML is a template literal inside panelHtml(). Extracting the literal
// is enough for these assertions and avoids standing up a DOM the module would
// need to mount into.
function panelMarkup() {
  const start = source.indexOf('<!DOCTYPE html>');
  const end = source.indexOf('</body></html>', start);
  assert.ok(start > -1 && end > start, 'panel template literal not found');
  return source.slice(start, end);
}

const markup = panelMarkup();

// Read one CSS rule's body by selector, so an assertion names the rule it means
// rather than grepping a substring that could match a comment.
function ruleBody(selector) {
  const i = markup.indexOf(selector + ' {');
  if (i === -1) {
    const j = markup.indexOf(selector);
    if (j === -1) return null;
    const open = markup.indexOf('{', j);
    return open === -1 ? null : markup.slice(open + 1, markup.indexOf('}', open));
  }
  const open = markup.indexOf('{', i);
  return markup.slice(open + 1, markup.indexOf('}', open));
}

test('the template literal contains no backtick', () => {
  // A backtick inside the literal ends the string early and the module stops
  // parsing. This happened three times while the panel was being written, each
  // time from prose in a comment, so it is pinned rather than remembered.
  assert.equal(markup.includes('`'), false);
});

test('state colour comes from host tokens, never a hardcoded palette', () => {
  // The host ships 21 skins x light/dark, so a copied palette is wrong in 20 of
  // 21. The panel's original #d19a2f measured 2.51:1 on light backgrounds,
  // failing AA 3:1 for UI components.
  for (const hex of ['#3fa45b', '#d19a2f', '#c2544d']) {
    assert.equal(markup.includes(hex), false, `legacy hardcoded ${hex} is back`);
  }
  for (const token of ['--host-success', '--host-warning', '--host-error', '--host-text']) {
    assert.ok(markup.includes(token), `${token} missing`);
  }
});

test('state text derives from the measured 45% mix, guarded by @supports', () => {
  // 45% is the measured answer: it clears 4.5:1 in every skin (worst 5.08:1)
  // where 50% does not (4.44:1). @supports is load-bearing, not decorative — a
  // custom property accepts any token stream at parse time, so without it an
  // engine lacking color-mix keeps the declaration and fails later at
  // computed-value time.
  assert.ok(markup.includes('@supports (color: color-mix(in srgb, red 50%, blue))'));
  for (const name of ['--ok-text', '--warn-text', '--bad-text']) {
    const mix = new RegExp(`${name}:\\s*color-mix\\(in srgb, var\\(--host-\\w+[^)]*\\) 45%`);
    assert.match(markup, mix, `${name} is not the 45% host mix`);
  }
  // Raw-hue fallbacks must exist OUTSIDE the @supports block, so an engine
  // without color-mix still gets a hue that means the right thing.
  const beforeSupports = markup.slice(0, markup.indexOf('@supports'));
  assert.ok(beforeSupports.includes('--warn-text: var(--host-warning'));
});

test('the disabled fill rule cannot repaint an inert commit button', () => {
  // Defect 1. The fill is scoped to :not(:disabled) AND the disabled rule is
  // declared afterwards, so neither specificity nor order can resurrect it.
  assert.ok(markup.includes('button.commit:not(:disabled)'),
    'commit fill is not scoped to the enabled state');
  const iCommit = markup.indexOf('button.commit:not(:disabled)');
  const iDisabled = markup.indexOf('button:disabled {');
  assert.ok(iDisabled > iCommit,
    'button:disabled must come after the commit fill or the cascade repaints it');
});

test('arming the confirm row de-emphasises the trigger', () => {
  // Defect 2. Two mechanisms on purpose: :has() where supported, and a body
  // class the script sets, so the rule holds on an engine without :has().
  assert.ok(markup.includes('body:has(#confirm:not([hidden])) button#sync'));
  assert.ok(markup.includes('body.armed button#sync'));
  assert.ok(markup.includes("document.body.classList.add('armed')"));
  assert.ok(markup.includes("document.body.classList.remove('armed')"),
    'disarming must clear the class or the trigger stays outlined forever');
});

test('the error path renders one muted line, not a framed box', () => {
  // Defect 3. The frame belonged to a .state card that no longer exists; the
  // failure state must be a single quiet line.
  // Asserted on the OUTCOME, not on the mechanism: the panel builds its DOM with
  // createElement now, so a test that pinned an innerHTML string was pinning how
  // the line is produced rather than that it is a single quiet line.
  assert.match(markup, /'note', 'Status unavailable/,
    'error path does not render as a plain note line');
  assert.equal(/class="state[ "]/.test(markup), false,
    'a framed .state container is back on the error path');
});

test('state is signalled by a word as well as a colour', () => {
  // Defect 4. DESIGN.md §3: colour is never the only channel.
  // The word now lives in the masthead pill rather than inline in the headline,
  // so the channel is the same and the carrier changed. What matters is that a
  // word accompanies the colour for every state.
  assert.match(markup, /id="pill"/, 'no state pill in the masthead');
  for (const word of ['current', 'behind', 'blocked', 'unknown']) {
    assert.ok(markup.includes(`'${word}'`), `state word ${word} missing`);
  }
  // Colour alone must never be the signal: the pill's tone classes exist, but the
  // word is set on the same call.
  assert.match(markup, /setPill\(/, 'nothing sets the state word');
});

test('the destructive action is armed, never fired by one click', () => {
  // The P0: Sync mutated a production checkout with exactly the same friction as
  // Refresh. #sync now arms; only #go posts.
  assert.match(markup, /\$\('sync'\)\.addEventListener\('click', arm\)/);
  assert.match(markup, /\$\('go'\)\.addEventListener\('click', \(\) => act\('sync'/);
  assert.equal(/\$\('sync'\)\.addEventListener\('click', \(\) => act\('sync'/.test(markup), false,
    'sync is wired straight to the merge again');
});

test('the confirm text restates the computed facts and the safety guarantee', () => {
  // The guarantee existed but sat in the lowest-emphasis text BEFORE the click.
  // At the moment of commitment it has to be present.
  assert.ok(markup.includes('confirm-text'));
  assert.ok(markup.includes('On conflict the fork is restored and nothing is left half-merged'));
  assert.ok(markup.includes('touch files this fork also'),
    'confirm does not say how many steps are risky');
});

test('refresh stays available while a merge runs', () => {
  // Freezing every control locked the operator out and dropped a screen
  // reader's focus to <body>. Only the two action buttons disable.
  //
  // Asserted on act()'s own body, isolated by brace matching rather than by
  // slicing to the next known string: an earlier version sliced to the refresh
  // listener and still passed when act() was mutated to disable all three, so
  // the test proved nothing. Verified by mutation after the fix.
  const at = source.indexOf('async function act(');
  assert.ok(at > -1, 'act() not found');
  let depth = 0, end = -1;
  for (let i = source.indexOf('{', at); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  assert.ok(end > at, 'could not brace-match act()');
  const act = source.slice(at, end);

  const disabled = [...act.matchAll(/\$\('(\w+)'\)\.disabled = true/g)].map((m) => m[1]);
  assert.deepEqual(disabled.sort(), ['dry', 'sync'],
    `act() must disable exactly dry and sync, got: ${disabled.join(', ') || 'none'}`);
  // act() legitimately calls refresh() at the end to re-read status, so the word
  // itself is expected here; the hazard is refresh being *disabled*. An earlier
  // version banned the word and failed on correct code.
  assert.equal(/\$\('refresh'\)\.disabled\s*=\s*true/.test(act), false,
    'act() disables refresh again — the operator must not be locked out mid-merge');
  assert.equal(/\[[^\]]*'refresh'[^\]]*\]\.forEach/.test(act), false,
    'act() disables a list that includes refresh');
});

test('asynchronous regions are announced', () => {
  // Sam gets no notification of a merge starting or finishing without these.
  const state = markup.slice(markup.indexOf('id="state"'), markup.indexOf('id="state"') + 90);
  assert.ok(state.includes('role="status"') && state.includes('aria-live="polite"'));
  const result = markup.slice(markup.indexOf('id="result"'), markup.indexOf('id="result"') + 90);
  assert.ok(result.includes('role="status"') && result.includes('aria-live="polite"'));
});

test('focus is visible and returns after cancelling', () => {
  assert.ok(markup.includes('button:focus-visible'), 'no focus-visible styling');
  assert.ok(markup.includes("$('go').focus()"), 'arming does not move focus to the commit button');
  assert.ok(markup.includes("$('sync').focus()"), 'cancelling does not return focus');
});

test('buttons meet the 44px target and narrow viewports are handled', () => {
  const body = ruleBody('button');
  assert.ok(body && body.includes('min-height:44px'), 'button min-height is not 44px');
  assert.ok(markup.includes('@media (max-width: 420px)'), 'no narrow-viewport rule');
  assert.ok(markup.includes('flex:1 1 100%'), 'buttons do not go full-width when narrow');
});

test('the panel reports its own last read, and drops it when narrow', () => {
  // The one self-referential fact DESIGN.md rule 2 allows: nothing else on
  // screen can say when THIS panel last looked.
  assert.match(markup, /'checked', 'checked '/, 'the panel does not report its own last read');
  assert.match(markup, /@media \(max-width: 420px\) \{ \.checked \{ display:none; \} \}/);
});

test('the panel never runs git itself', () => {
  // The merge policy lives in one place — hermes sync-fork — shared by the CLI,
  // the cron job and this panel. A second copy here would drift.
  // `exec(` is deliberately NOT in this list: RegExp.prototype.exec is used to
  // read cron schedule expressions, and banning the substring flagged that as
  // shelling out. The hazard is a child process, so name the child-process API.
  for (const forbidden of ['child_process', 'spawn(', 'execFile', 'execSync']) {
    assert.equal(source.includes(forbidden), false, `panel reaches for ${forbidden}`);
  }
  for (const route of ['/api/fork-keeper/', 'status', 'dry-run', 'sync']) {
    assert.ok(markup.includes(route));
  }
});

test('interpolated values are escaped before reaching innerHTML', () => {
  // Reasons and file paths come from a subprocess boundary; unescaped they are
  // an injection into the panel's own markup.
  // The panel no longer escapes-then-concatenates: it builds nodes and sets
  // textContent, which is what DESIGN.md §8 requires ("no innerHTML on any path
  // that can carry stored data"). Conflicted paths and a cron's reason string both
  // originate upstream, so this is the stronger guarantee, not a weaker one.
  assert.match(markup, /node\.textContent = String\(text\)/, 'no textContent-based builder');
  assert.equal(/\.innerHTML\s*=/.test(markup), false,
    'an innerHTML assignment is back on a path that can carry stored data');
  assert.equal(markup.includes('const esc = ('), false,
    'the hand-rolled escaper is back; textContent makes it unnecessary');
});

test('unsafe requests carry the host CSRF token', () => {
  // The WebUI injects X-Hermes-CSRF-Token by patching window.fetch, but only in
  // documents it renders itself. This panel runs in an iframe srcdoc, which has
  // its OWN window, so the patched fetch is absent and a POST arrives with an
  // Origin (srcdoc inherits it) and no token — which the server rejects with 403.
  // Verified against the real _check_csrf: token_mismatch. Both action buttons
  // were dead in production until the panel borrowed the parent's fetch.
  assert.match(markup, /window\.parent[\s\S]{0,120}\.fetch/,
    'the panel does not borrow the host fetch; unsafe requests will 403');
  // And the borrowed function is what call() actually uses.
  const at = markup.indexOf('async function call(');
  assert.ok(at > -1, 'call() not found');
  const call = markup.slice(at, markup.indexOf('\n  }', at));
  assert.match(call, /hostFetch\(/, 'call() bypasses the borrowed fetch');
  assert.equal(/[^.]\bfetch\('\/api/.test(call), false,
    'call() still uses the frame-local fetch for an API request');
});

test('a status with no commit count is never rendered as healthy', () => {
  // Defaulting behind to 0 turned every payload WITHOUT a numeric behind into a
  // green "Up to date with upstream / Current" — including the bridge's own
  // error objects. Fabricating health out of a failed read is the one thing this
  // panel must not do: the operator stops looking exactly when something broke.
  const at = markup.indexOf('function render(');
  assert.ok(at > -1, 'render() not found');
  let depth = 0, end = -1;
  for (let i = markup.indexOf('{', at); i < markup.length; i += 1) {
    if (markup[i] === '{') depth += 1;
    else if (markup[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const render = markup.slice(at, end);
  assert.match(render, /typeof s\.behind !== 'number'/,
    'render() does not check that behind is a number');
  // The guard must come BEFORE the headline is computed, or it cannot prevent
  // the green reading. Anchored on the assignment, not on the headline text:
  // that same text appears in the comment above the guard explaining this bug,
  // and matching the comment made this assertion fail against correct code.
  const headlineAt = render.indexOf('const headline =');
  assert.ok(headlineAt > -1, 'headline assignment not found');
  assert.ok(render.indexOf("typeof s.behind !== 'number'") < headlineAt,
    'the guard runs after the headline is built, so it cannot prevent it');
  // And the guard has to actually stop rendering, not just warn.
  const guardBlock = render.slice(render.indexOf("typeof s.behind !== 'number'"), headlineAt);
  assert.match(guardBlock, /return;/, 'the guard does not return, so rendering continues');
  assert.equal(/behind = s\.behind \?\? 0/.test(render), false,
    'behind still defaults to 0, which reads a broken status as current');
});

test('a pending gateway restart is surfaced', () => {
  // A merge that landed but never reached the running process is the one state a
  // green "up to date" actively misleads about: the checkout IS current and the
  // gateway is not. The cron cannot restart it (#30719), so this line is the
  // only thing that tells anyone to.
  // Anchored on the CONDITION, not on any mention of the field: the warning text
  // also interpolates s.restart_pending, so a plain match stayed green when the
  // condition itself was replaced by a constant — this test MISSED that mutation
  // until it named the branch.
  // Conditional on the field, so replacing the condition with a constant fails.
  assert.match(markup, /const pending = o && o\.restart_pending/,
    'the restart notice is not driven by restart_pending');
  assert.match(markup, /if \(!pending\) \{ box\.hidden = true; return; \}/,
    'the notice shows even when nothing is pending');
  assert.match(markup, /older than this checkout/i);
  // And the commit has to reach the operator, not just the branch.
  assert.match(markup, /short\(pending\)/,
    'the pending commit is not shown, so the warning cannot be acted on');
});

test('a second sync cannot start while one is running', () => {
  // Refresh deliberately stays clickable during a long merge, and refresh
  // re-enables the action buttons from the server's status — which would let a
  // second sync-fork start on top of the running one, two processes merging into
  // the same checkout.
  assert.match(markup, /let busy = false/, 'no in-flight flag');
  const at = markup.indexOf('async function act(');
  const act = markup.slice(at, markup.indexOf('\n  }', at));
  assert.match(act, /if \(busy\) return/, 'act() does not refuse a concurrent run');
  // The reset must be in a finally. show() writes innerHTML, so a throw from
  // inside the catch block would skip a plain `busy = false` statement and leave
  // the flag stuck true — both action buttons dead for the life of the panel.
  const finallyAt = act.indexOf('} finally {');
  assert.ok(finallyAt > -1, 'act() has no finally block');
  const resetAt = act.indexOf('busy = false');
  assert.ok(resetAt > finallyAt,
    'busy is reset outside the finally, so a throw in the catch leaves it stuck');

  // ENUMERATE both action buttons rather than matching the substring once: the
  // guard appears twice (dry and sync), so a single match stays green when only
  // one of them loses it — verified by mutation, which this test first MISSED.
  const guarded = [...markup.matchAll(/\$\('(dry|sync)'\)\.disabled = ([^;]+);/g)]
    .map((m) => [m[1], m[2].trim()]);
  const inRender = guarded.filter(([, expr]) => expr.includes('actionable'));
  assert.equal(inRender.length, 2,
    `render() must set both action buttons from actionable, found ${inRender.length}`);
  for (const [id, expr] of inRender) {
    assert.ok(expr.includes('busy'),
      `${id} is re-enabled from status alone (${expr}) — a refresh mid-merge would ` +
      'offer a second sync while the first is still running');
  }
});

test('requests cannot hang forever', () => {
  // A request that never settles leaves the panel frozen with no way back.
  assert.match(markup, /AbortController/, 'no request timeout');
  assert.match(markup, /signal: ac\.signal/, 'the abort signal is not passed to fetch');
  assert.match(markup, /timed out waiting for/, 'a timeout is not reported as one');
});

test('the timeout covers reading the body, not just the headers', () => {
  // fetch() settles as soon as the response HEADERS arrive. Clearing the timeout
  // there left res.json() — which waits for the whole BODY — with no deadline, so
  // a server that sent headers and then stalled froze the panel permanently: the
  // exact failure the timeout exists to prevent.
  const at = markup.indexOf('async function call(');
  assert.ok(at > -1, 'call() not found');
  let depth = 0, end = -1;
  for (let i = markup.indexOf('{', at); i < markup.length; i += 1) {
    if (markup[i] === '{') depth += 1;
    else if (markup[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  const call = markup.slice(at, end);
  const bodyAt = call.search(/await readBody\(|await res\.json\(/);
  const clearAt = call.indexOf('clearTimeout');
  assert.ok(bodyAt > -1, 'call() never reads the body');
  assert.ok(clearAt > -1, 'call() never clears its timeout');
  assert.ok(clearAt > bodyAt,
    'clearTimeout runs before the body is read, so a stalled body has no deadline');
});

test('a non-2xx explains itself instead of collapsing to a status code', () => {
  // The bridge answers 400 (the upstream ref does not resolve), 502 (unparsable
  // CLI output) and 504 (timeout) with an explanation. Throwing on the status
  // alone reduced all of them to "HTTP 400", which names nothing to fix.
  const at = markup.indexOf('async function call(');
  const call = markup.slice(at, markup.indexOf('\n  }', at));
  assert.match(call, /body\.error \|\| body\.reason/,
    'the error body is discarded, so every bridge failure reads as a bare status');
  // And the body must be read BEFORE the status is judged.
  assert.ok(call.search(/await readBody\(|await res\.json\(/) < call.indexOf('if (!res.ok)'),
    'the status is judged before the body is read, so the explanation is lost');
});

test('a failed status refresh disarms the confirm row', () => {
  // An armed confirm row outlives the status it was armed against, so "Merge
  // now" could be pressed against a reading the panel has just admitted it
  // cannot make.
  // Named reload(), not refresh(): `refresh` is also an element id, and a DOM id
  // becomes a window property that beats a function declaration for elements that
  // exist before the script runs — the first call threw "refresh is not a
  // function". The id stays; ours was renamed.
  const at = markup.indexOf('async function reload(');
  assert.ok(at > -1, 'reload() not found');
  const refresh = markup.slice(at, markup.indexOf('\n  }', at));
  assert.match(refresh, /hideConfirm\(\)/,
    'the error path leaves the confirm row armed against an unknown status');
});
