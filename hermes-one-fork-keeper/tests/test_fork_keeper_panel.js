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
  assert.ok(markup.includes("state.innerHTML = '<p class=\"note\">Status unavailable"),
    'error path does not render as a plain note line');
  assert.equal(/class="state[ "]/.test(markup), false,
    'a framed .state container is back on the error path');
});

test('state is signalled by a word as well as a colour', () => {
  // Defect 4. DESIGN.md §3: colour is never the only channel.
  assert.ok(markup.includes('class="state-word"'));
  for (const word of ['Current', 'Behind', 'Blocked']) {
    assert.ok(markup.includes(`'${word}'`), `state word ${word} missing`);
  }
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
  assert.ok(markup.includes("'<p class=\"checked\">checked '"));
  assert.match(markup, /@media \(max-width: 420px\) \{ \.checked \{ display:none; \} \}/);
});

test('the panel never runs git itself', () => {
  // The merge policy lives in one place — hermes sync-fork — shared by the CLI,
  // the cron job and this panel. A second copy here would drift.
  for (const forbidden of ['child_process', 'exec(', 'spawn(']) {
    assert.equal(source.includes(forbidden), false, `panel reaches for ${forbidden}`);
  }
  for (const route of ['/api/fork-keeper/', 'status', 'dry-run', 'sync']) {
    assert.ok(markup.includes(route));
  }
});

test('interpolated values are escaped before reaching innerHTML', () => {
  // Reasons and file paths come from a subprocess boundary; unescaped they are
  // an injection into the panel's own markup.
  assert.ok(markup.includes('const esc = (s) =>'));
  assert.match(markup, /esc\(reason/);
  assert.match(markup, /esc\(f\)/);
});
