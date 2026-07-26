/**
 * The version guard, tested against REAL captured API bodies.
 *
 * Run: `node --test check/version-guard.test.mjs`  (Node's built-in runner —
 * this repo has no dependencies and does not acquire one for a test.)
 *
 * The fixtures in fixtures/ are verbatim responses from the live service, not
 * hand-written objects: a guard tested only against a literal
 * `{schema_version: 1}` proves nothing about the shape the API actually emits.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SCHEMA_VERSION, contractMatches } from './contract.js';

const load = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

test('the page accepts the contract version it was built against', () => {
  const body = load(`api-v${SCHEMA_VERSION}-ok.json`);
  assert.equal(body.schema_version, SCHEMA_VERSION, 'fixture must carry the built-against version');
  assert.equal(contractMatches(body), true);
});

test('every previous contract is refused, not rendered', () => {
  // Real bodies captured from this same service before each bump. These are the
  // cases the guard exists for and the ones a synthetic object cannot prove:
  // every slot on this page would still find SOMETHING to put in them.
  //
  //   v1 — carries `address`, no `address_resolved`, no `caveat_ids`.
  //   v2 — carries `open_questions[].prompt` (a CLI prompt string) and no
  //        `kind`, so a form would draw no control and a bucket-B question
  //        would silently go back to being read-only. It also has no
  //        `outcome`, so a terminal status would render an empty box.
  //   v3 — has no `claimable_exemptions`. This is the subtle one, and the
  //        reason an ADDITIVE change still got a version bump: every slot on
  //        this page would fill correctly and the result would look completely
  //        normal. What would be missing is the favourable path — the two
  //        vrijstellingen on a decided rule — with nothing on screen to say so.
  //        A silently absent offer is indistinguishable from an address that has
  //        none.
  const v1 = load('api-v1-ok.json');
  assert.equal(v1.schema_version, 1);
  assert.equal(contractMatches(v1), false);
  assert.ok('address' in v1 && !('address_resolved' in v1), 'v1 fixture must be genuinely older');

  const v2 = load('api-v2-ok.json');
  assert.equal(v2.schema_version, 2);
  assert.equal(contractMatches(v2), false);
  const question = v2.activities[0].open_questions[0];
  assert.ok('prompt' in question && !('kind' in question), 'v2 fixture must be genuinely older');

  const v3 = load('api-v3-ok.json');
  assert.equal(v3.schema_version, 3);
  assert.equal(contractMatches(v3), false);
  assert.ok(
    v3.activities.every((a) => !('claimable_exemptions' in a)),
    'v3 fixture must be genuinely older',
  );
});

test('the version this page speaks actually carries the channel it was bumped for', () => {
  // Guards the other direction: a bump with no adoption behind it. If this ever
  // passes vacuously — an ok fixture where no activity offers anything — the
  // fixture stopped exercising the reason v4 exists.
  const body = load(`api-v${SCHEMA_VERSION}-ok.json`);
  const offered = body.activities.flatMap((a) => a.claimable_exemptions ?? []);
  assert.ok(offered.length > 0, 'the v4 fixture must actually carry an offer');
  for (const offer of offered) {
    for (const field of ['id', 'kind', 'rule_id', 'exception_id', 'citation', 'statement', 'offer']) {
      assert.ok(offer[field], `offer is missing ${field}`);
    }
  }
});

test('any other version is refused, not rendered', () => {
  const body = load(`api-v${SCHEMA_VERSION}-ok.json`);
  for (const other of [SCHEMA_VERSION + 1, SCHEMA_VERSION - 1, 99]) {
    assert.equal(contractMatches({ ...body, schema_version: other }), false, `v${other}`);
  }
});

test('every shape the API returns carries the field, so the guard is answerable', () => {
  // The guard runs before `status` is read, so it must work on the shapes that
  // are not a check result at all.
  for (const name of ['api-v4-ok.json', 'api-v4-mismatch.json', 'api-v4-invalid.json']) {
    const body = load(name);
    assert.ok(Number.isInteger(body.schema_version), `${name} must carry an integer version`);
    assert.equal(contractMatches(body), true, name);
  }
});

test('an absent, null or non-numeric version is a mismatch, never a pass', () => {
  const body = load(`api-v${SCHEMA_VERSION}-ok.json`);
  for (const bad of [
    { ...body, schema_version: undefined },
    { ...body, schema_version: null },
    { ...body, schema_version: String(SCHEMA_VERSION) },
    {},
    null,
    undefined,
  ]) {
    assert.equal(contractMatches(bad), false);
  }
});
