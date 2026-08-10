#!/usr/bin/env node
// Mutation-test the fork-keeper panel suite.
//
// Each mutation reintroduces a defect the review found and the fix removed: the
// missing CSRF token that made both action buttons 403, a broken status rendered
// as green "up to date", a second sync startable mid-merge, a request with no
// timeout, an armed confirm row surviving a failed refresh.
//
// Every mutation asserts the anchor occurs EXACTLY once and that the file really
// changed. Two earlier mutation runs in this project reported MISSED when the
// real problem was a replace that hit nothing, or hit one of two identical
// occurrences — the test was right and the harness was lying.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = '/home/rodrigo/Workspace/hermes-one-extensions';
const PANEL = path.join(REPO, 'hermes-one-fork-keeper/fork-keeper-nav.js');
const NODE = '/home/rodrigo/.hermes/node/bin/node';
const TESTS = 'hermes-one-fork-keeper/tests/test_*.js';

const MUTATIONS = [
  ['unsafe requests lose the host CSRF token',
   'res = await hostFetch(',
   'res = await window.fetch('],

  ['a broken status renders as green "up to date"',
   "if (typeof s.behind !== 'number' || !Number.isFinite(s.behind)) {",
   'if (false) {'],

  ['behind silently defaults to 0 again',
   'const behind = s.behind, ahead = s.ahead ?? 0;',
   'const behind = s.behind ?? 0, ahead = s.ahead ?? 0;'],

  ['a second sync can start while one runs',
   '    if (busy) return;',
   '    if (false) return;'],

  ['a refresh mid-merge re-enables the action buttons',
   "$('dry').disabled = !actionable || busy;",
   "$('dry').disabled = !actionable;"],

  ['requests can hang forever',
   '        signal: ac.signal,',
   '        // no signal'],

  ['a failed refresh leaves the confirm row armed',
   `      $('dry').disabled = true; $('sync').disabled = true;
      // An armed confirm row outlives the status it was armed against, so
      // "Merge now" could be pressed against a reading the panel has just
      // admitted it cannot make. Disarm.
      hideConfirm();`,
   `      $('dry').disabled = true; $('sync').disabled = true;`],

  ['a pending gateway restart is no longer surfaced',
   '      (s.restart_pending',
   '      (false'],

  // show() writes innerHTML, so a throw inside the catch block skips a plain
  // reset and leaves busy stuck true: both action buttons dead for the life of
  // the panel, with no error the operator can act on.
  ['the busy reset leaves the finally block',
   `    } finally {
      // finally, not a plain statement after the catch`,
   `    }
    if (false) {
      // finally, not a plain statement after the catch`],
];

function runSuite() {
  try {
    const out = execFileSync(NODE, ['--test', TESTS], {
      cwd: REPO, encoding: 'utf8', timeout: 300000,
    });
    return parse(out);
  } catch (err) {
    return parse((err.stdout || '') + (err.stderr || ''));
  }
}

function parse(out) {
  const pass = /^# pass (\d+)$/m.exec(out);
  const fail = /^# fail (\d+)$/m.exec(out);
  const names = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { pass: pass ? +pass[1] : -1, fail: fail ? +fail[1] : -1, names };
}

const original = fs.readFileSync(PANEL, 'utf8');

let r = runSuite();
console.log(`  baseline                                            pass=${r.pass} fail=${r.fail}`);
if (r.fail !== 0 || r.pass <= 0) {
  console.log('  baseline not clean — aborting');
  process.exit(2);
}

let caught = 0, skipped = 0;
for (const [label, from, to] of MUTATIONS) {
  const occurrences = original.split(from).length - 1;
  if (occurrences !== 1) {
    console.log(`  ${label.padEnd(51)} ANCHOR x${occurrences}`);
    skipped += 1;
    continue;
  }
  const mutated = original.replace(from, to);
  if (mutated === original) {
    console.log(`  ${label.padEnd(51)} DID NOT LAND`);
    skipped += 1;
    continue;
  }
  fs.writeFileSync(PANEL, mutated);
  r = runSuite();
  const verdict = r.fail > 0 ? 'caught' : 'MISSED';
  console.log(`  ${label.padEnd(51)} pass=${String(r.pass).padEnd(3)} fail=${String(r.fail).padEnd(3)} ${verdict}`);
  if (r.fail > 0) {
    caught += 1;
    console.log(`      by: ${r.names.slice(0, 3).join(' | ')}`);
  }
  fs.writeFileSync(PANEL, original);
}

const intact = fs.readFileSync(PANEL, 'utf8') === original;
console.log(`  restored byte-identical: ${intact}`);
r = runSuite();
console.log(`  final                                               pass=${r.pass} fail=${r.fail}`);
const total = MUTATIONS.length - skipped;
console.log(`  caught ${caught}/${total} (${skipped} skipped)`);
process.exit(caught === total && r.fail === 0 && intact && skipped === 0 ? 0 : 1);
