/**
 * Render the REAL captured API responses through the real templates.
 *
 * Run: `node --test check/render.test.mjs`
 *
 * The lint proves the CSS and the includes are structurally sound; it cannot
 * prove that a response actually renders. This does, against verbatim bodies
 * from the live service — including the completeness guard, which is what stands
 * between a partial render and a false legal statement on screen.
 *
 * The DOM is a deliberately tiny shim, not a dependency (`test-dom.mjs`): this
 * repo has none and does not acquire one for a test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { installDom } from './test-dom.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const load = (name) => JSON.parse(readFileSync(here(`./fixtures/${name}`), 'utf8'));

installDom(here('./sections/templates.html'));
const { renderResult, renderMismatch, RenderError } = await import('./render.js');

/* ---- the tests ----------------------------------------------------------- */

test('a real ok response renders, completeness guard included', () => {
  const data = load('api-v4-ok.json');
  assert.equal(data.status, 'ok');
  const fragment = renderResult(data); // assertComplete throws on any shortfall
  assert.ok(fragment);
});

test('the heading is the RESOLVED address, not what was typed', () => {
  const data = load('api-v4-ok.json');
  const fragment = renderResult(data);
  const heading = fragment.querySelector('[data-slot="address_resolved"]');
  assert.equal(heading.textContent, data.address_resolved.weergavenaam);
  assert.notEqual(heading.textContent, data.address_query);
  // and the query is still shown, as the lesser line
  assert.equal(
    fragment.querySelector('[data-slot="address_query"]').textContent,
    data.address_query,
  );
});

test('every linked caveat is rendered on its own entry', () => {
  const data = load('api-v4-ok.json');
  const linked = data.activities.flatMap((a) =>
    ['decided', 'needs_user_input', 'needs_external_source'].flatMap((k) =>
      (a.buckets[k] ?? []).flatMap((e) => e.caveat_ids ?? []),
    ),
  );
  assert.ok(linked.length > 0, 'the fixture must actually exercise the linkage');
  const fragment = renderResult(data);
  assert.equal(fragment.querySelectorAll('.entry-caveat').length, linked.length);
});

test('the summary list still carries every caveat', () => {
  const data = load('api-v4-ok.json');
  const fragment = renderResult(data);
  assert.equal(fragment.querySelectorAll('.caveats .caveat').length, data.caveats.length);
});

test('a dangling caveat id refuses to render rather than dropping the flag', () => {
  const data = load('api-v4-ok.json');
  const broken = structuredClone(data);
  broken.activities[0].buckets.decided[0].caveat_ids = ['does-not-exist'];
  assert.throws(() => renderResult(broken), RenderError);
});

test('a real mismatch renders the API sentences and offers the resolved address', () => {
  const data = load('api-v4-mismatch.json');
  assert.equal(data.status, 'address_mismatch');
  let resubmitted = null;
  const fragment = renderMismatch(data, (r) => {
    resubmitted = r;
  });

  assert.equal(
    fragment.querySelector('[data-slot="statement"]').textContent,
    data.address_match.statement,
  );
  assert.equal(
    fragment.querySelector('[data-slot="consequence"]').textContent,
    data.address_match.consequence,
  );
  // no verdict anywhere
  assert.equal(fragment.querySelectorAll('.activity').length, 0);
  assert.equal(fragment.querySelectorAll('.verdict').length, 0);

  const button = fragment.querySelector('[data-slot="resubmit"]');
  if (data.address_resolved) {
    assert.equal(button.hidden, false);
    button.click();
    assert.deepEqual(resubmitted, data.address_resolved);
  } else {
    assert.equal(button.hidden, true);
  }
});

test('a mismatch without a statement refuses rather than showing an empty box', () => {
  const data = structuredClone(load('api-v4-mismatch.json'));
  data.address_match.statement = null;
  assert.throws(() => renderMismatch(data, () => {}), RenderError);
});
