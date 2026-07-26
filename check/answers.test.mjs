/**
 * The answer form: controls, conditions, batching, refusals, and what changed.
 *
 * Run: `node --test check/answers.test.mjs`
 *
 * Driven by REAL captured API bodies (`fixtures/api-v3-*.json`) and the REAL
 * templates, through the same tiny shim `render.test.mjs` uses. A form tested
 * against a hand-written question object would prove nothing about the shape the
 * service actually emits — and the shape is the whole point of this slice.
 *
 * The properties under test are the ones a screenshot cannot show:
 *   · every open question gets a control, and it is the control its `kind` implies
 *   · every word on the form comes from the response or from templates.html
 *   · one question sets its facts WHOLE (the three-way pair, the permit gate)
 *   · `ask_if` hides AND clears, so a stale answer cannot be submitted
 *   · a refusal keeps the answers and lands on the field that caused it
 *   · nothing is written anywhere but memory
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { installDom } from './test-dom.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const load = (name) => JSON.parse(readFileSync(here(`./fixtures/${name}`), 'utf8'));
const source = (name) => readFileSync(here(`./${name}`), 'utf8');

installDom(here('./sections/templates.html'));
const {
  RenderError,
  applyAnswers,
  nextFacts,
  openQuestionsOf,
  readAnswers,
  renderResult,
  renderTerminal,
  ruleIdsIn,
  showRejections,
  showServiceMessage,
} = await import('./render.js');

const OK = load('api-v3-ok.json');
const ANSWERED = load('api-v3-answered.json');
const SCOPE = load('api-v3-scope.json');

const form = (data = OK) => ({ fragment: renderResult(data), questions: openQuestionsOf(data) });
const fieldFor = (fragment, id) =>
  fragment.querySelector(`.answer[data-question="${id}"]`);
const pick = (fragment, questionId, choiceId) => {
  const input = fieldFor(fragment, questionId).querySelector(
    `input[name="q-${questionId}"][value="${choiceId}"]`,
  );
  input.checked = true;
  return input;
};
const type = (fragment, questionId, value) => {
  fieldFor(fragment, questionId).querySelector(`input[name="q-${questionId}"]`).value = value;
};

/* ---- controls ------------------------------------------------------------ */

test('every open question gets a control, and it is the one its kind implies', () => {
  const { fragment, questions } = form();
  assert.ok(questions.length > 0, 'the fixture must actually carry open questions');

  for (const question of questions) {
    const field = fieldFor(fragment, question.id);
    assert.ok(field, `no control for ${question.id}`);
    const inputs = field.querySelectorAll(`input[name="q-${question.id}"]`);
    if (['bool', 'categorical', 'three_way', 'pre2021_permit'].includes(question.kind)) {
      assert.equal(inputs.length, question.choices.length, `${question.id}: radio count`);
      for (const input of inputs) assert.equal(input.type, 'radio');
    } else {
      assert.equal(inputs.length, 1, `${question.id}: one field`);
      assert.equal(inputs[0].type, question.kind === 'date' ? 'date' : 'number');
    }
  }
});

test('the questions appear once each, in the order the API sent them', () => {
  const { fragment, questions } = form();
  const rendered = fragment
    .querySelectorAll('.answer[data-question]')
    .map((f) => f.dataset.question);
  assert.deepEqual(rendered, questions.map((q) => q.id));
  assert.equal(new Set(rendered).size, rendered.length);
  // The order is contract: a conditional question must never precede the answer
  // its condition reads.
  for (const question of questions.filter((q) => q.ask_if)) {
    const source_ = questions.find((q) => (q.facts ?? []).includes(question.ask_if.fact));
    assert.ok(
      rendered.indexOf(source_.id) < rendered.indexOf(question.id),
      `${question.id} is drawn before the answer it depends on`,
    );
  }
});

test('a question that appears under both activities gets ONE control', () => {
  // `belongs_to_appartementencomplex` is open for omzetting AND woningvorming.
  const shared = OK.activities
    .map((a) => new Set(a.open_questions.map((q) => q.id)))
    .reduce((a, b) => new Set([...a].filter((id) => b.has(id))));
  assert.ok(shared.size > 0, 'the fixture must exercise a shared question');
  const { fragment } = form();
  for (const id of shared) {
    assert.equal(fragment.querySelectorAll(`.answer[data-question="${id}"]`).length, 1);
  }
});

test("every label on the form is the API's own, never composed here", () => {
  const { fragment, questions } = form();
  for (const question of questions) {
    const field = fieldFor(fragment, question.id);
    assert.equal(field.querySelector('[data-slot="text"]').textContent, question.text);
    assert.equal(field.querySelector('[data-slot="promise"]').textContent, question.promise);
    const labels = field.querySelectorAll('[data-slot="label"]').map((l) => l.textContent);
    assert.deepEqual(labels, question.choices.map((c) => c.label));
  }
});

test('neither JS file writes a Dutch sentence', () => {
  // The page's standing rule, kept mechanical. `render.js` and `check.js` build
  // DOM and move response strings into it; every user-visible word lives in
  // sections/*.html or in the response.
  for (const name of ['render.js', 'check.js']) {
    const text = source(name).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const literal of text.matchAll(/'([^'\\\n]{4,})'|"([^"\\\n]{4,})"/g)) {
      const value = literal[1] ?? literal[2];
      assert.ok(
        !/\b(uw|het|een|niet|wij|deze|adres|vraag|antwoord)\b/i.test(value),
        `${name} contains Dutch copy: ${value}`,
      );
    }
  }
});

/* ---- reading the form back ----------------------------------------------- */

test('the three-way question sets BOTH its facts, from the declaration', () => {
  const { fragment, questions } = form();
  const question = questions.find((q) => q.kind === 'three_way');
  const choice = question.choices[2]; // "Ja, maar niet als hoofdverblijf"
  pick(fragment, question.id, choice.id);
  const facts = readAnswers(fragment, questions);
  for (const [name, value] of Object.entries(choice.facts)) {
    assert.equal(facts[name], value);
  }
  // Never half of a pair — that is the combination the corpus forbids.
  assert.equal(Object.keys(choice.facts).length, 2);
});

test('an untouched control contributes nothing', () => {
  const { fragment, questions } = form();
  assert.deepEqual(readAnswers(fragment, questions), {});
});

test('a number is parsed, and a Dutch comma decimal with it', () => {
  const { fragment, questions } = form();
  const float = questions.find((q) => q.kind === 'float' && !q.ask_if);
  type(fragment, float.id, '62,5');
  assert.equal(readAnswers(fragment, questions)[float.facts[0]], 62.5);
});

test('a value we cannot parse is sent as typed, not dropped', () => {
  // Dropping it silently is how someone believes they answered while the verdict
  // does not move. Sent as-is, it comes back as a named 422 they can see.
  const { fragment, questions } = form();
  const float = questions.find((q) => q.kind === 'float' && !q.ask_if);
  type(fragment, float.id, 'ongeveer 60');
  assert.equal(readAnswers(fragment, questions)[float.facts[0]], 'ongeveer 60');
});

/* ---- ask_if -------------------------------------------------------------- */

test('a conditional question is hidden until its condition is met', () => {
  const { fragment, questions } = form();
  const conditional = questions.find((q) => q.ask_if);
  assert.ok(conditional, 'the fixture must carry a conditional question');

  readAnswers(fragment, questions);
  assert.equal(fieldFor(fragment, conditional.id).hidden, true);

  const three = questions.find((q) => (q.facts ?? []).includes(conditional.ask_if.fact));
  const yes = three.choices.find((c) => c.facts[conditional.ask_if.fact] === conditional.ask_if.equals);
  pick(fragment, three.id, yes.id);
  readAnswers(fragment, questions);
  assert.equal(fieldFor(fragment, conditional.id).hidden, false);
});

test('withdrawing the condition hides AND clears the answer', () => {
  // Leaving the value behind would submit a number given under one premise under
  // another — and for `verhuurder_eigen_go_m2` that premise is what makes the
  // number mean anything. The server refuses it too; this is so the user is not
  // refused for something they cannot see.
  const { fragment, questions } = form();
  const conditional = questions.find((q) => q.ask_if);
  const three = questions.find((q) => (q.facts ?? []).includes(conditional.ask_if.fact));
  const yes = three.choices.find((c) => c.facts[conditional.ask_if.fact] === conditional.ask_if.equals);
  const no = three.choices.find((c) => c.facts[conditional.ask_if.fact] !== conditional.ask_if.equals);

  pick(fragment, three.id, yes.id);
  readAnswers(fragment, questions);
  type(fragment, conditional.id, '40');
  assert.equal(readAnswers(fragment, questions)[conditional.facts[0]], 40);

  pick(fragment, three.id, yes.id).checked = false;
  pick(fragment, three.id, no.id);
  const facts = readAnswers(fragment, questions);
  assert.equal(fieldFor(fragment, conditional.id).hidden, true);
  assert.ok(!(conditional.facts[0] in facts));
  assert.equal(
    fieldFor(fragment, conditional.id).querySelector(`input[name="q-${conditional.id}"]`).value,
    '',
  );
});

/* ---- the pre-2021 permit scope guard ------------------------------------- */

test('the permit date is withheld unless every gate is affirmative', () => {
  // The real declaration, produced by the API's own wire builder. No Zaanstad
  // rule surfaces this question today, so it cannot be captured from a response —
  // and that is exactly why the guard needs a test of its own.
  const question = load('question-pre2021-permit.json');
  const data = structuredClone(OK);
  data.activities[0].open_questions = [{ ...question, promise: 'x' }];
  const fragment = renderResult(data);
  const questions = openQuestionsOf(data);
  const datum = question.sub_questions.find((s) => s.role === 'fact');

  const setDate = () => {
    fragment
      .querySelector(`input[name="q-${question.id}-${datum.id}"]`)
      .value = '2019-06-12';
  };
  const tick = (name, value) => {
    fragment.querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
  };

  // Date filled in, no gate answered at all.
  setDate();
  assert.ok(!(datum.fact in readAnswers(fragment, questions)));

  // Top-level gate only: the sub-questions open, the fact still does not travel.
  tick(`q-${question.id}`, 'ja');
  setDate();
  assert.ok(!(datum.fact in readAnswers(fragment, questions)));

  // Scope DENIED — a permit for a dakkapel. Still withheld.
  tick(`q-${question.id}-scope`, 'nee');
  setDate();
  assert.ok(!(datum.fact in readAnswers(fragment, questions)));

  // Scope confirmed: now, and only now.
  fragment.querySelector(`input[name="q-${question.id}-scope"][value="nee"]`).checked = false;
  tick(`q-${question.id}-scope`, 'ja');
  setDate();
  assert.equal(readAnswers(fragment, questions)[datum.fact], '2019-06-12');
});

test('the dossier sub-question never becomes a fact', () => {
  const question = load('question-pre2021-permit.json');
  const dossier = question.sub_questions.find((s) => s.role === 'dossier');
  assert.equal(dossier.fact, null);

  const data = structuredClone(OK);
  data.activities[0].open_questions = [{ ...question, promise: 'x' }];
  const fragment = renderResult(data);
  const questions = openQuestionsOf(data);
  for (const name of [`q-${question.id}`, `q-${question.id}-scope`]) {
    fragment.querySelector(`input[name="${name}"][value="ja"]`).checked = true;
  }
  fragment.querySelector(`input[name="q-${question.id}-${dossier.id}"]`).value = 'Z-2019-0042';
  fragment.querySelector(`input[name="q-${question.id}-datum"]`).value = '2019-06-12';

  const facts = readAnswers(fragment, questions);
  assert.deepEqual(Object.keys(facts), ['omgevingsvergunning_verleend_op']);
  assert.ok(!JSON.stringify(facts).includes('Z-2019-0042'));
});

/* ---- batching and carrying answers --------------------------------------- */

test('answers for questions the form no longer shows are carried, not dropped', () => {
  // A question leaves bucket B *because* it was answered. Dropping the answer on
  // the next re-check would silently undo the thing the user just did.
  const { fragment, questions } = form();
  const carried = { bbl_conformity_plausible: true, min_new_unit_gbo_m2: 62.0 };
  const after = form(ANSWERED); // bucket B is empty here
  const facts = nextFacts(after.fragment, after.questions, carried);
  assert.deepEqual(facts, carried);
  assert.equal(fragment.querySelectorAll('.answer[data-question]').length, questions.length);
});

test('a question still on the form is authoritative, even when emptied', () => {
  const { fragment, questions } = form();
  const float = questions.find((q) => q.kind === 'float' && !q.ask_if);
  const stale = { [float.facts[0]]: 99 };
  const facts = nextFacts(fragment, questions, stale);
  assert.ok(!(float.facts[0] in facts), 'a cleared field must clear the fact');
});

test('the answers are restored into the form after a re-check', () => {
  const { fragment, questions } = form();
  const three = questions.find((q) => q.kind === 'three_way');
  const choice = three.choices[0];
  applyAnswers(fragment, questions, { ...choice.facts });
  const checked = fieldFor(fragment, three.id).querySelector(
    `input[name="q-${three.id}"]:checked`,
  );
  assert.equal(checked.value, choice.id);
});

/* ---- refusals ------------------------------------------------------------ */

test("a 422 lands on the field that caused it, with the API's own message", () => {
  const { fragment } = form();
  const invalid = load('api-v3-invalid.json');
  const rejected = invalid.declared_facts.rejected;
  assert.ok(rejected.length > 0);

  const unplaced = showRejections(fragment, rejected);
  assert.deepEqual(unplaced, [], 'every rejection must be placeable');
  for (const rejection of rejected) {
    const field = fragment.querySelector(`.answer[data-facts~="${rejection.fact}"]`);
    const line = field.querySelector('[data-slot="rejection"]');
    assert.equal(line.hidden, false);
    assert.equal(line.querySelector('[data-slot="message"]').textContent, rejection.message);
    assert.equal(line.querySelector('[data-slot="fact"]').textContent, rejection.fact);
  }
  assert.equal(fragment.querySelector('[data-slot="answers-error"]').hidden, false);
});

test('a rejection with no field on screen is reported, never swallowed', () => {
  const { fragment } = form();
  const unplaced = showRejections(fragment, [
    { fact: 'woz_waarde', message: 'x' },
  ]);
  assert.equal(unplaced.length, 1);
});

test('a service message sits beside the form instead of replacing it', () => {
  // Replacing the result on a 429 would take the answers with it — being locked
  // out of your own form for ten minutes is what batching exists to avoid.
  const { fragment } = form();
  showServiceMessage(fragment, 'Te veel aanvragen.');
  const line = fragment.querySelector('[data-slot="answers-service"]');
  assert.equal(line.hidden, false);
  assert.equal(line.textContent, 'Te veel aanvragen.');
  showServiceMessage(fragment, null);
  assert.equal(line.hidden, true);
});

/* ---- what changed, and what did not -------------------------------------- */

test('a re-check shows which points moved out of bucket B', () => {
  const previouslyOpen = ruleIdsIn(OK, 'needs_user_input');
  assert.ok(previouslyOpen.size > 0);
  const fragment = renderResult(ANSWERED, { previouslyOpen });

  const moved = [...previouslyOpen].filter((id) => ruleIdsIn(ANSWERED, 'decided').has(id));
  assert.ok(moved.length > 0, 'the fixture must actually move rules');
  assert.equal(fragment.querySelectorAll('.changed-item').length, moved.length);
  assert.equal(fragment.querySelector('[data-slot="changed-block"]').hidden, false);
});

test('a first render claims nothing changed', () => {
  const fragment = renderResult(OK);
  assert.equal(fragment.querySelector('[data-slot="changed-block"]').hidden, true);
  assert.equal(fragment.querySelectorAll('.changed-item').length, 0);
});

test('the ceiling survives the re-check', () => {
  // Answering everything still cannot beat `verdict_ceiling`, and the copy that
  // says so must be on the SECOND screen too — that is the screen where a user
  // has just done everything asked of them.
  const fragment = renderResult(ANSWERED, { previouslyOpen: ruleIdsIn(OK, 'needs_user_input') });
  for (const activity of ANSWERED.activities) {
    assert.ok(activity.verdict_ceiling_reason, 'the fixture must still be ceilinged');
  }
  const reasons = fragment
    .querySelectorAll('[data-slot="verdict_ceiling_reason"]')
    .map((n) => n.textContent);
  assert.deepEqual(reasons, ANSWERED.activities.map((a) => a.verdict_ceiling_reason));
  for (const block of fragment.querySelectorAll('[data-slot="ceiling-block"]')) {
    assert.equal(block.hidden, false);
  }
});

test('a bucket-C question does not promise that answering completes anything', () => {
  const { fragment, questions } = form();
  const partial = questions.filter((q) => !q.fully_resolves);
  assert.ok(partial.length > 0, 'the fixture must carry a not-fully-resolving question');
  for (const question of partial) {
    const shown = fieldFor(fragment, question.id).querySelector('[data-slot="promise"]').textContent;
    assert.equal(shown, question.promise);
    assert.ok(!/genoeg/.test(shown), `${question.id} reads as sufficient`);
  }
});

/* ---- the terminal sentences ---------------------------------------------- */

test('a terminal status renders the API sentences and none of its own', () => {
  assert.equal(SCOPE.status, 'out_of_scope');
  const fragment = renderTerminal(SCOPE);
  assert.equal(
    fragment.querySelector('[data-slot="statement"]').textContent,
    SCOPE.outcome.statement,
  );
  assert.equal(
    fragment.querySelector('[data-slot="consequence"]').textContent,
    SCOPE.outcome.consequence,
  );
  assert.ok(fragment.querySelectorAll('.statusbox__covered li').length > 0);
});

test('a terminal status without its sentence refuses rather than showing a blank box', () => {
  const data = structuredClone(SCOPE);
  data.outcome = null;
  assert.throws(() => renderTerminal(data), RenderError);
});

/* ---- the answers stay in memory ------------------------------------------ */

test('nothing is written to storage, a cookie or the URL', () => {
  // The household facts describe who lives where and `mantelzorg_noodzakelijk` is
  // a statement about someone's health needs. A reload legitimately loses them.
  for (const name of ['render.js', 'check.js']) {
    // Comments stripped: check.js's header NAMES these sinks in order to promise
    // it does not use them, and that promise should not fail its own test.
    const text = source(name).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const sink of [
      'localStorage',
      'sessionStorage',
      'document.cookie',
      'indexedDB',
      'pushState',
      'replaceState',
      'location.hash',
      'location.search',
      'navigator.sendBeacon',
    ]) {
      assert.ok(!text.includes(sink), `${name} touches ${sink}`);
    }
  }
});

test('the request body carries the answers and nothing else', () => {
  // `facts` is omitted entirely when there is nothing to send, so the API can
  // tell "I supplied nothing" from "I supplied things and none were used".
  const text = source('check.js');
  assert.ok(text.includes('Object.keys(facts).length'), 'the empty case must be omitted');
  assert.ok(!/method:\s*'GET'/.test(text), 'answers must never reach a query string');
});
