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

test('any other version is refused, not rendered', () => {
  const body = load(`api-v${SCHEMA_VERSION}-ok.json`);
  for (const other of [SCHEMA_VERSION + 1, SCHEMA_VERSION - 1, 99]) {
    assert.equal(contractMatches({ ...body, schema_version: other }), false, `v${other}`);
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
