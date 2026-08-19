// The kit's host-frame CSS rules that no render can catch, pinned by source
// scan.
//
// The update-banner rule exists because the host's banner (the FIRST child of
// <main class="main">) lives outside the host's own visibility system, so it
// painted ~76px of amber above every extension panel (measured on the
// Capability Router, router-01-abertura.png, y≈45-105). A render test cannot
// see it from inside a panel document — the banner is a host-document element
// — so the contract is pinned here, in the file that ships it.
//
// The rules that MUST NOT drift:
//   1. the banner is hidden only while an extension panel is showing;
//   2. the selector is scoped to > #updateBanner — never .update-banner —
//      because #staleClientBanner (index.html:422) is a second .update-banner
//      in flow whose warning is the stale-CSRF notice extension proxies depend
//      on;
//   3. no !important: specificity (1,2,1) already beats .update-banner.visible
//      (0,2,0), and this file documents why the kit avoids !important.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const HERE = __dirname;
const CSS_CANDIDATES = [
  path.join(HERE, '..', 'hermes-panel.css'),   // deployed: tests/ inside the extension dir
  path.join(HERE, 'hermes-panel.css'),         // side by side in the checkout
];
const cssPath = CSS_CANDIDATES.find((p) => fs.existsSync(p)) || CSS_CANDIDATES[0];
const css = fs.readFileSync(cssPath, 'utf8');

test('the update banner is hidden while an extension panel is showing', () => {
  assert.match(css, /main\.main\[class\*="showing-x-"\][^{]*> #updateBanner\s*\{\s*display: none;\s*\}/,
    'the rule must hide #updateBanner exactly when an extension panel class is on <main>');
});

test('the rule is scoped to the id, never to the shared .update-banner class', () => {
  // A second .update-banner (#staleClientBanner) is in flow, and its warning is
  // the stale-session notice the extension proxies depend on — hiding the CLASS
  // would hide the one warning that must survive.
  assert.doesNotMatch(css, /\.update-banner\s*\{\s*display: none;?\s*\}/,
    'the class must never be hidden by this kit');
});

test('the rule wins by specificity, not by !important', () => {
  // (1,2,1) beats .update-banner.visible (0,2,0); the file documents why the
  // kit avoids !important (a heavier hammer aimed at more than the nail).
  const rule = css.match(/main\.main\[class\*="showing-x-"\][^}]*> #updateBanner[^}]*\}/);
  assert.ok(rule, 'rule present');
  assert.doesNotMatch(rule[0], /!important/);
  assert.doesNotMatch(rule[0], /\.update-banner/,
    'the selector must name #updateBanner, not the shared class');
});
