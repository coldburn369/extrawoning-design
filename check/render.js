/**
 * Renderer for a POST /api/check response.
 *
 * This module is a RENDERER, not an interpreter. It moves strings out of the
 * response and into the templates in sections/templates.html. It does not
 * decide what anything means. Concretely, it must never:
 *
 *   · pick a colour or treatment from `status`, `kind` or `semantic`
 *     — only from `presentation.tone`, through TONE_CLASS below;
 *   · decide whether something is good news;
 *   · compose, translate, summarise or shorten a Dutch sentence;
 *   · compute or infer a verdict.
 *
 * There is no Dutch in this file. Every sentence the user reads is either a
 * response field or chrome sitting in sections/templates.html. If a result
 * needs a sentence the response does not carry, that is an API gap — it does
 * not get written here.
 *
 * All text lands via textContent, never innerHTML: response strings are data,
 * and this is the only thing standing between an upstream string and script
 * injection.
 */

/**
 * tone -> CSS class. The ONE data-to-treatment mapping on this page.
 *
 * `cleared` is the only tone that may read as good news, and the server grants
 * it under a deliberately narrow condition (api/contract.py: a decisive rule
 * that passed on its own conditions). Everything else is neutral or warning
 * coloured, including the two PASS tones:
 *
 *   obligation — `zst-omz-000` PASS means "you need a permit". A PASS, and not
 *                good news. Rendering it green would state the opposite of the
 *                law.
 *   disclosure — "this was established, it is not an approval".
 *
 * An unrecognised tone falls back to the neutral class, never to `cleared`:
 * if the server grows a tone this page has not seen, showing it as
 * undifferentiated beats showing it as cleared.
 */
export const TONE_CLASS = Object.freeze({
  cleared: 'tone--cleared',
  obligation: 'tone--obligation',
  disclosure: 'tone--disclosure',
  blocking: 'tone--blocking',
  mitigable: 'tone--mitigable',
  exempt: 'tone--exempt',
  moot: 'tone--moot',
  not_applicable: 'tone--not-applicable',
  unknown: 'tone--unknown',
});

const TONE_FALLBACK = 'tone--unknown';

/** A mandatory disclosure could not be placed. Carries a machine token only. */
export class RenderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const clone = (id) => {
  const node = document.getElementById(id);
  if (!node) throw new RenderError(id);
  return node.content.cloneNode(true);
};

const slot = (root, name) => {
  const el = root.querySelector(`[data-slot="${name}"]`);
  if (!el) throw new RenderError(name);
  return el;
};

const setText = (root, name, value) => {
  slot(root, name).textContent = value == null ? '' : String(value);
};

const show = (root, name, visible) => {
  slot(root, name).hidden = !visible;
};

/** Append `items` rendered through `build`, into the named slot. */
const fillList = (root, name, items, build) => {
  const host = slot(root, name);
  for (const item of items) host.append(build(item));
  return host;
};

/* -------------------------------------------------------------------------
   The answer form.

   Every control is drawn from `question.kind` and labelled from
   `question.choices`. This module still writes no Dutch: a radio's label is a
   response string, a number field's label is the question's own `text`, and the
   sentence under each question is the response's `promise`.

   ONE form for the whole result. Facts are request-scoped, so a question that
   appears under both activities gets ONE control — two would be two answers for
   one fact inside a single submit.
------------------------------------------------------------------------- */

/** kind -> the `type` attribute of a scalar input. Choice kinds are absent. */
const SCALAR_INPUT = Object.freeze({
  int: { type: 'number', step: '1' },
  float: { type: 'number', step: 'any' },
  date: { type: 'date' },
  text: { type: 'text' },
});

const CHOICE_KINDS = new Set(['bool', 'categorical', 'three_way', 'pre2021_permit']);

/**
 * One radio group, from the declared choices.
 *
 * `name` scopes the group; `value` is the choice's own id. The id is what the
 * server round-trips — never an index, never a letter — so a reordered choice
 * list cannot silently change what a stored selection means.
 */
function buildChoices(host, name, choices) {
  for (const choice of choices) {
    const node = clone('tpl-answer-choice');
    const input = slot(node, 'input');
    input.name = name;
    input.value = choice.id;
    setText(node, 'label', choice.label);
    host.append(node);
  }
}

function buildScalar(host, name, kind) {
  const spec = SCALAR_INPUT[kind];
  if (!spec) throw new RenderError(`kind:${kind}`);
  const node = clone('tpl-answer-scalar');
  const input = slot(node, 'input');
  input.name = name;
  input.type = spec.type;
  if (spec.step) input.step = spec.step;
  host.append(node);
}

function buildControl(host, name, kind, choices) {
  if (CHOICE_KINDS.has(kind)) buildChoices(host, name, choices ?? []);
  else buildScalar(host, name, kind);
}

/**
 * One question, with its sub-questions if it has any.
 *
 * The sub-questions are rendered inside their parent and stay hidden until the
 * parent gate is answered affirmatively. That nesting is not cosmetic: the
 * pre-2021 permit date only counts when the permit was granted for the
 * woningvorming itself, and a date field that could be reached without the gate
 * in front of it would be the guard removed.
 */
function buildAnswer(question) {
  const node = clone('tpl-answer');
  const field = slot(node, 'answer');
  field.dataset.question = question.id;
  field.dataset.kind = question.kind;
  if (question.ask_if) field.dataset.askIfFact = question.ask_if.fact;

  setText(node, 'text', question.text);
  setText(node, 'promise', question.promise);
  buildControl(slot(node, 'control'), `q-${question.id}`, question.kind, question.choices);

  const subs = question.sub_questions ?? [];
  fillList(node, 'sub_questions', subs, (sub) => {
    const item = clone('tpl-answer-sub');
    const subField = slot(item, 'answer');
    subField.dataset.sub = sub.id;
    subField.dataset.role = sub.role;
    if (sub.fact) subField.dataset.fact = sub.fact;
    setText(item, 'text', sub.text);
    buildControl(slot(item, 'control'), `q-${question.id}-${sub.id}`, sub.kind, sub.choices);
    return item;
  });
  show(node, 'sub_questions', false);

  return node;
}

/**
 * Every open question across every activity, deduped by question id, in the
 * order the API sent them.
 *
 * That order is contract, not convenience: `verhuurder_eigen_go_m2` is gated on
 * an answer the self-inhabitation question supplies, and the API emits questions
 * in its catalog's declared asking order so a conditional field never precedes
 * the answer that decides whether to show it.
 */
export function openQuestionsOf(data) {
  const seen = new Map();
  for (const activity of data.activities ?? []) {
    for (const question of activity.open_questions ?? []) {
      if (!seen.has(question.id)) seen.set(question.id, question);
    }
  }
  return [...seen.values()];
}

function renderAnswerForm(root, data) {
  const questions = openQuestionsOf(data);
  fillList(root, 'questions', questions, (question) => {
    const node = buildAnswer(question);
    const field = node.querySelector('.answer');
    field.dataset.facts = (question.facts ?? []).join(' ');
    if (question.ask_if) field.dataset.askIfEquals = JSON.stringify(question.ask_if.equals);
    return node;
  });
  show(root, 'answers-block', questions.length > 0);
  return questions;
}

/* -------------------------------------------------------------------------
   Reading the form back.

   One walk in DOM order does two jobs, and it has to be one walk: a conditional
   question's visibility depends on an answer given ABOVE it, and the API emits
   questions in its declared asking order precisely so that this is possible in
   a single pass.

   Absent is never defaulted. An untouched control contributes nothing, the
   server sees UNKNOWN, and the verdict degrades honestly — the same product law
   the CLI's "leeg = overslaan" obeys.
------------------------------------------------------------------------- */

const checkedValue = (field, name) =>
  field.querySelector(`input[name="${name}"]:checked`)?.value ?? null;

/** A scalar's value, or null when the user has not filled it in. */
function scalarValue(field, name, kind) {
  const raw = field.querySelector(`input[name="${name}"]`)?.value ?? '';
  const text = raw.trim();
  if (!text) return null;
  if (kind === 'date' || kind === 'text') return text;
  // Comma decimals are how Dutch keyboards produce 52,5. Normalising here is the
  // same class of transformation as upper-casing the postcode, and the server
  // validates the number regardless.
  const number = Number(text.replace(',', '.'));
  // A value we cannot turn into a number is sent AS TYPED, not dropped. It comes
  // back as a named 422 the user can see; dropping it silently is how someone
  // believes they answered while the verdict did not move.
  return Number.isFinite(number) ? number : text;
}

/** The facts one choice-kind question declares, from the catalog's own map. */
function choiceFacts(question, id) {
  return (question.choices ?? []).find((choice) => choice.id === id)?.facts ?? null;
}

/**
 * The pre-2021 permit question: the date is supplied only when the top-level
 * gate AND every declared `gate` sub-question are affirmative.
 *
 * Driven off `role`, exactly as the server's own consumer is. A renderer that
 * decided for itself which sub-question was the guard would be the place the
 * guard gets lost — and losing it means a permit for a dakkapel EXEMPTs the
 * permit duty and MOOTs six weigeringsgronden.
 */
function permitFacts(field, question) {
  const gates = (question.sub_questions ?? []).filter((sub) => sub.role === 'gate');
  const open = checkedValue(field, `q-${question.id}`) === 'ja';
  field.querySelector('[data-slot="sub_questions"]').hidden = !open;
  if (!open) return null;
  for (const gate of gates) {
    if (checkedValue(field, `q-${question.id}-${gate.id}`) !== 'ja') return null;
  }
  const out = {};
  for (const sub of question.sub_questions ?? []) {
    if (sub.role !== 'fact' || !sub.fact) continue;
    const value = scalarValue(field, `q-${question.id}-${sub.id}`, sub.kind);
    if (value !== null) out[sub.fact] = value;
  }
  return out;
}

/**
 * Read every visible answer, applying `ask_if` as it goes.
 *
 * A question whose condition is not met is hidden AND cleared. Leaving a stale
 * value behind would let an answer the user gave under one premise be submitted
 * under another — and for `verhuurder_eigen_go_m2` that premise is what makes
 * the number mean anything at all.
 */
export function readAnswers(root, questions) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const facts = {};
  for (const field of root.querySelectorAll('.answer[data-question]')) {
    const question = byId.get(field.dataset.question);
    if (!question) continue;

    if (field.dataset.askIfFact) {
      const met =
        JSON.stringify(facts[field.dataset.askIfFact]) === field.dataset.askIfEquals;
      field.hidden = !met;
      if (!met) {
        for (const input of field.querySelectorAll('input')) {
          if (input.type === 'radio') input.checked = false;
          else input.value = '';
        }
        continue;
      }
    }

    if (question.kind === 'pre2021_permit') {
      Object.assign(facts, permitFacts(field, question) ?? {});
      continue;
    }
    if (CHOICE_KINDS.has(question.kind)) {
      const id = checkedValue(field, `q-${question.id}`);
      if (id !== null) Object.assign(facts, choiceFacts(question, id) ?? {});
      continue;
    }
    const value = scalarValue(field, `q-${question.id}`, question.kind);
    if (value !== null) facts[(question.facts ?? [])[0]] = value;
  }
  return facts;
}

/**
 * Put the answers back into the form after a re-check or a refusal.
 *
 * A choice is selected by finding the declared choice whose facts map is
 * satisfied — matched against the DECLARATION, never reconstructed. That is what
 * keeps a three-way selection whole: "Ja, als hoofdverblijf" is restored only
 * when both of its facts are, and never split into two half-answers.
 */
export function applyAnswers(root, questions, facts) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  for (const field of root.querySelectorAll('.answer[data-question]')) {
    const question = byId.get(field.dataset.question);
    if (!question) continue;
    if (question.kind === 'pre2021_permit') {
      applyPermitAnswers(field, question, facts);
      continue;
    }
    if (CHOICE_KINDS.has(question.kind)) {
      const match = (question.choices ?? []).find((choice) =>
        Object.entries(choice.facts ?? {}).every(([k, v]) => facts[k] === v),
      );
      if (!match) continue;
      const input = field.querySelector(`input[name="q-${question.id}"][value="${match.id}"]`);
      if (input) input.checked = true;
      continue;
    }
    const value = facts[(question.facts ?? [])[0]];
    if (value === undefined) continue;
    const input = field.querySelector(`input[name="q-${question.id}"]`);
    if (input) input.value = String(value);
  }
}

/**
 * The permit question restored from the one fact it can produce.
 *
 * Both gates go back to "ja", because the date could not have been supplied
 * otherwise. The kenmerk is NOT restored: it is a dossier note, never a fact, so
 * it never left the browser and there is nothing to restore it from. Inventing
 * one would be this page making up a reference number.
 */
function applyPermitAnswers(field, question, facts) {
  const supplies = (question.sub_questions ?? []).find((sub) => sub.role === 'fact');
  const value = supplies?.fact ? facts[supplies.fact] : undefined;
  if (value === undefined) return;
  const tick = (name) => {
    const input = field.querySelector(`input[name="${name}"][value="ja"]`);
    if (input) input.checked = true;
  };
  tick(`q-${question.id}`);
  for (const gate of (question.sub_questions ?? []).filter((s) => s.role === 'gate')) {
    tick(`q-${question.id}-${gate.id}`);
  }
  const input = field.querySelector(`input[name="q-${question.id}-${supplies.id}"]`);
  if (input) input.value = String(value);
  field.querySelector('[data-slot="sub_questions"]').hidden = false;
}

/**
 * The facts to send next: what is on the form now, plus what was accepted for
 * questions the form no longer shows.
 *
 * The split matters in both directions. A question that left bucket B because it
 * was answered must keep its answer, or the next re-check would silently undo
 * it. A question still ON the form is authoritative — including when its control
 * is now empty, which is how clearing a conditional answer actually clears it
 * rather than resurrecting the value from this cache.
 */
export function nextFacts(root, questions, accumulated = {}) {
  const onForm = new Set(questions.flatMap((q) => q.facts ?? []));
  const carried = Object.fromEntries(
    Object.entries(accumulated).filter(([fact]) => !onForm.has(fact)),
  );
  return { ...carried, ...readAnswers(root, questions) };
}

/** 429 / 503 on a re-check: the service's own sentence, beside the form. */
export function showServiceMessage(root, message) {
  const line = root.querySelector('[data-slot="answers-service"]');
  if (!line) return;
  line.textContent = message ?? '';
  line.hidden = !message;
}

/**
 * Put each rejection on the field that caused it, using the API's own message.
 *
 * Returns the rejections that found no field. A message the user never sees is
 * the silent-ignore failure the 422 exists to prevent, so the caller falls back
 * to the dedicated 422 view rather than letting one disappear.
 */
export function showRejections(root, rejections) {
  for (const field of root.querySelectorAll('.answer[data-question]')) {
    field.querySelector('[data-slot="rejection"]').hidden = true;
    field.classList.remove('answer--rejected');
  }
  const unplaced = [];
  for (const rejection of rejections) {
    const field = root.querySelector(`.answer[data-facts~="${CSS.escape(rejection.fact)}"]`);
    if (!field) {
      unplaced.push(rejection);
      continue;
    }
    const line = field.querySelector('[data-slot="rejection"]');
    line.querySelector('[data-slot="fact"]').textContent = rejection.fact;
    line.querySelector('[data-slot="message"]').textContent = rejection.message;
    line.hidden = false;
    field.classList.add('answer--rejected');
  }
  const error = root.querySelector('[data-slot="answers-error"]');
  if (error) error.hidden = rejections.length === 0;
  return unplaced;
}

/* -------------------------------------------------------------------------
   What the answers changed.
------------------------------------------------------------------------- */

/** Rule ids currently sitting in a bucket, across every activity. */
export function ruleIdsIn(data, bucket) {
  const ids = new Set();
  for (const activity of data.activities ?? []) {
    for (const entry of activity.buckets?.[bucket] ?? []) ids.add(entry.rule_id);
  }
  return ids;
}

/**
 * The points that moved out of "you can answer this" into "we tested it".
 *
 * This is the entire reward for filling the form in, so it is shown rather than
 * left for the user to spot by comparing two screens. Computed from the two
 * responses' own bucket membership — no inference about WHY a rule moved, and
 * no claim about what the test then found: the entry below says that.
 */
function renderChanged(root, data, previouslyOpen) {
  const decided = [];
  for (const activity of data.activities ?? []) {
    for (const entry of activity.buckets?.decided ?? []) {
      if (previouslyOpen?.has(entry.rule_id)) decided.push(entry);
    }
  }
  fillList(root, 'changed', decided, (entry) => {
    const node = clone('tpl-changed-item');
    setText(node, 'rule_id', entry.rule_id);
    setText(node, 'description', entry.description);
    return node;
  });
  show(root, 'changed-block', decided.length > 0);
  return decided.length;
}

/* -------------------------------------------------------------------------
   Disclosure channels. Presumptions and declared exclusions share a shape;
   they are kept as two calls rather than one generic loop so that a change to
   one channel cannot silently alter the other.
------------------------------------------------------------------------- */

function buildDisclosureItem(templateId, item) {
  const node = clone(templateId);
  setText(node, 'statement', item.statement);
  setText(node, 'consequence', item.consequence);
  setText(node, 'citation', item.citation);
  return node;
}

function renderDisclosures(root, data) {
  const presumptions = data.presumptions ?? [];
  fillList(root, 'presumptions', presumptions, (p) => buildDisclosureItem('tpl-presumption', p));
  show(root, 'presumptions-block', presumptions.length > 0);

  const exclusions = data.declared_exclusions ?? [];
  fillList(root, 'declared_exclusions', exclusions, (e) => buildDisclosureItem('tpl-exclusion', e));
  show(root, 'exclusions-block', exclusions.length > 0);

  const caveats = data.caveats ?? [];
  fillList(root, 'caveats', caveats, (c) => {
    const node = clone('tpl-caveat');
    setText(node, 'text', c.text);
    return node;
  });
  show(root, 'caveats-block', caveats.length > 0);

  setText(root, 'disclaimer', data.disclaimer);
}

/* -------------------------------------------------------------------------
   Rule entries
------------------------------------------------------------------------- */

/**
 * The caveats bearing on ONE entry, rendered inline with it.
 *
 * The server resolved which caveats those are (`entry.caveat_ids`) by
 * intersecting the facts a caveat qualifies with the facts the rule reads. This
 * page looks them up by id and renders them; it does not know, and must not
 * learn, which caveat belongs to which rule.
 *
 * An id that does not resolve is a RenderError, not a silent skip. The whole
 * point of the linkage is that a Blokkade whose basis is flagged uncertain
 * carries the flag WHERE IT IS READ; an entry that quietly lost its caveat looks
 * exactly like an entry that never had one, and the summary list at the foot is
 * precisely the distance this exists to close. Showing nothing beats showing a
 * blockade with its qualification missing.
 */
function buildEntryCaveats(node, entry, caveatsById) {
  const ids = entry.caveat_ids ?? [];
  const found = ids.map((id) => {
    const caveat = caveatsById.get(id);
    if (!caveat) throw new RenderError(`caveat:${id}`);
    return caveat;
  });
  fillList(node, 'entry-caveats-list', found, (caveat) => {
    const item = clone('tpl-entry-caveat');
    setText(item, 'text', caveat.text);
    return item;
  });
  show(node, 'entry-caveats', found.length > 0);
}

function buildEntry(entry, caveatsById = new Map()) {
  const node = clone('tpl-entry');
  const article = node.querySelector('.entry');

  // The only place presentation is turned into treatment. `entry.status`,
  // `entry.kind` and `entry.semantic` are deliberately not read here.
  article.classList.add(TONE_CLASS[entry.presentation.tone] ?? TONE_FALLBACK);
  article.dataset.tone = entry.presentation.tone;

  setText(node, 'presentation.label', entry.presentation.label);
  // Verbatim and never clipped. MOOT entries carry the Bbl / goed-
  // verhuurderschap sentence here, and a shortened version of it would drop
  // obligations that survive the mooting.
  setText(node, 'presentation.statement', entry.presentation.statement);
  setText(node, 'description', entry.description);
  setText(node, 'rule_id', entry.rule_id);
  setText(node, 'citation', entry.citation);

  setText(node, 'unavailable_reason', entry.unavailable_reason);
  show(node, 'unavailable_reason', Boolean(entry.unavailable_reason));

  const questions = entry.questions ?? [];
  fillList(node, 'questions-list', questions, (q) => {
    const item = clone('tpl-question');
    setText(item, 'prompt', q.prompt);
    return item;
  });
  show(node, 'questions', questions.length > 0);

  buildEntryCaveats(node, entry, caveatsById);

  return node;
}

const BUCKETS = Object.freeze([
  ['decided', 'bucket-decided'],
  ['needs_user_input', 'bucket-user'],
  ['needs_external_source', 'bucket-source'],
]);

/* -------------------------------------------------------------------------
   Activities
------------------------------------------------------------------------- */

function buildActivity(activity, caveatsById = new Map()) {
  const node = clone('tpl-activity');

  setText(node, 'activity', activity.activity);
  setText(node, 'verdict_label', activity.verdict_label);
  setText(node, 'verdict_statement', activity.verdict_statement);

  for (const [key, blockSlot] of BUCKETS) {
    const entries = activity.buckets?.[key] ?? [];
    fillList(node, key, entries, (entry) => buildEntry(entry, caveatsById));
    show(node, blockSlot, entries.length > 0);
  }

  setText(node, 'verdict_ceiling_reason', activity.verdict_ceiling_reason);
  show(node, 'ceiling-block', Boolean(activity.verdict_ceiling_reason));

  setText(node, 'instrument_title', activity.instrument?.title);
  setText(node, 'version_label', activity.instrument?.version_label);
  setText(node, 'corpus_ref', activity.corpus_ref);

  return node;
}

/* -------------------------------------------------------------------------
   The completeness guard.

   A result shown without its presumptions, without its carve-out disclosure or
   with a clipped statement is a false legal statement. So the fragment is built
   detached, checked against the response it came from, and only mounted if it
   matches. On a mismatch the caller shows an error and NO result.
------------------------------------------------------------------------- */

const countIn = (fragment, selector) => fragment.querySelectorAll(selector).length;

function assertComplete(fragment, data) {
  const expect = (code, actual, wanted) => {
    if (actual !== wanted) throw new RenderError(code);
  };

  expect(
    'presumptions',
    countIn(fragment, '.disclosure--presumptions .disclosure-item'),
    (data.presumptions ?? []).length,
  );
  expect(
    'declared_exclusions',
    countIn(fragment, '.disclosure--exclusions .disclosure-item'),
    (data.declared_exclusions ?? []).length,
  );
  expect('caveats', countIn(fragment, '.caveats .caveat'), (data.caveats ?? []).length);

  // Every caveat the server linked to an entry must actually be sitting on that
  // entry. Counted across the fragment because the per-entry lookup already
  // throws on an unresolved id; this catches the other direction — a template or
  // slot change that stopped placing them at all.
  expect(
    'caveat_ids',
    countIn(fragment, '.entry .entry-caveat'),
    (data.activities ?? []).reduce(
      (total, activity) =>
        total +
        BUCKETS.reduce(
          (n, [key]) =>
            n +
            (activity.buckets?.[key] ?? []).reduce(
              (m, entry) => m + (entry.caveat_ids ?? []).length,
              0,
            ),
          0,
        ),
      0,
    ),
  );

  const disclaimer = fragment.querySelector('.disclosure--disclaimer [data-slot="disclaimer"]');
  if (!disclaimer?.textContent.trim()) throw new RenderError('disclaimer');

  // Every open question must have a control. A question that renders as prose
  // but not as a field is one the user is told about and cannot answer — the
  // read-only state this slice exists to end, reintroduced by a template slip.
  expect('open_questions', countIn(fragment, '.answer[data-question]'), openQuestionsOf(data).length);

  const activities = data.activities ?? [];
  expect('activities', countIn(fragment, '.activity'), activities.length);

  // Every entry's statement must be present character-for-character. This is
  // what proves nothing was truncated — the MOOT statement in particular.
  const rendered = new Map(
    [...fragment.querySelectorAll('.entry')].map((el) => [
      el.querySelector('[data-slot="rule_id"]').textContent,
      el.querySelector('[data-slot="presentation.statement"]').textContent,
    ]),
  );
  for (const activity of activities) {
    for (const [key] of BUCKETS) {
      for (const entry of activity.buckets?.[key] ?? []) {
        if (rendered.get(entry.rule_id) !== entry.presentation.statement) {
          throw new RenderError(entry.rule_id);
        }
      }
    }
  }
}

/* -------------------------------------------------------------------------
   Entry points. Each returns a detached fragment; the caller mounts it.
------------------------------------------------------------------------- */

/**
 * The resolved address is the HEADLINE of a result, not a footnote.
 *
 * A typo that is itself a real address — "Zuiddijk 4A" for "Zuiddijk 3A" — passes
 * every server-side check there is, because the user typed a valid dwelling. The
 * only thing that catches it is the user reading which house we answered about.
 * So `address_resolved` is what the heading says, and `address_query` is shown
 * beneath it as what was asked, clearly the lesser of the two.
 */
function renderResolvedAddress(fragment, data) {
  const resolved = data.address_resolved;
  setText(fragment, 'address_resolved', resolved?.weergavenaam ?? '');
  setText(fragment, 'address_query', data.address_query);
  show(fragment, 'address-resolved-line', Boolean(resolved?.weergavenaam));
}

/**
 * status === "ok": the full result, plus the form that makes bucket B answerable.
 *
 * `previouslyOpen` is the set of rule ids that sat in `needs_user_input` on the
 * response this one replaces. Passed in rather than remembered here, because
 * this module owns no state across requests.
 */
export function renderResult(data, { previouslyOpen } = {}) {
  const fragment = clone('tpl-result');
  renderResolvedAddress(fragment, data);
  setText(fragment, 'gemeente', data.gemeente);
  setText(fragment, 'gemeentecode', data.gemeentecode);
  show(fragment, 'gemeente-line', Boolean(data.gemeente));

  renderDisclosures(fragment, data);
  // Indexed once, so an entry can find the caveats bearing on it without this
  // module ever deciding which those are.
  const caveatsById = new Map((data.caveats ?? []).map((c) => [c.id, c]));
  fillList(fragment, 'activities', data.activities ?? [], (activity) =>
    buildActivity(activity, caveatsById),
  );

  renderChanged(fragment, data, previouslyOpen);
  renderAnswerForm(fragment, data);

  assertComplete(fragment, data);
  return fragment;
}

/**
 * status === "address_mismatch": we resolved something, but not what was asked.
 *
 * Deliberately NOT a flavour of `ok` or of `address_not_found`. There IS an
 * answer available and it is about a different dwelling; showing it would be the
 * exact failure this outcome exists to prevent. So: no verdict, the API's own
 * two sentences, and — when we found a real dwelling — a button that resubmits
 * it, because a dead end is how a user ends up accepting their second guess.
 *
 * `onResubmit` is passed in rather than imported: this module builds DOM and
 * does not own the transport.
 */
export function renderMismatch(data, onResubmit) {
  const fragment = clone('tpl-mismatch');
  const match = data.address_match ?? {};

  setText(fragment, 'address_query', data.address_query);
  // Both sentences come from the response. The server picks between "this house
  // number does not exist on this postcode" and "we found a different address";
  // choosing here would be this page deciding what the server's evidence means.
  setText(fragment, 'statement', match.statement);
  setText(fragment, 'consequence', match.consequence);

  const resolved = data.address_resolved;
  setText(fragment, 'address_resolved', resolved?.weergavenaam ?? '');
  show(fragment, 'resolved-block', Boolean(resolved));

  const button = slot(fragment, 'resubmit');
  if (resolved && typeof onResubmit === 'function') {
    button.addEventListener('click', () => onResubmit(resolved));
  } else {
    button.hidden = true;
  }

  renderDisclosures(fragment, data);
  if (!match.statement) throw new RenderError('address_match.statement');
  return fragment;
}

/**
 * status is out_of_scope / address_not_found / source_timeout.
 *
 * Both sentences come from `outcome` since schema_version 3. This page used to
 * carry all three headings itself — the last outcome text it wrote — and writing
 * "wij konden dit adres niet vaststellen" for ourselves was a claim about our
 * own coverage that the service never made. A response without the sentence is
 * a RenderError, not a silently blank box.
 */
export function renderTerminal(data) {
  const fragment = clone('tpl-status');
  setText(fragment, 'address_query', data.address_query);

  const outcome = data.outcome;
  if (!outcome?.statement) throw new RenderError('outcome');
  setText(fragment, 'statement', outcome.statement);
  setText(fragment, 'consequence', outcome.consequence);

  const covered = data.covered_gemeenten ?? [];
  fillList(fragment, 'covered_gemeenten', covered, (g) => {
    const node = clone('tpl-covered');
    setText(node, 'gemeente', g.gemeente);
    // A join of activity names, not a sentence — the names are the API's.
    setText(node, 'activities', (g.activities ?? []).join(' · '));
    return node;
  });
  show(fragment, 'covered-block', covered.length > 0);

  renderDisclosures(fragment, data);
  assertComplete(fragment, data);
  return fragment;
}

/** HTTP 429 / 503 — the body carries its own message. */
export function renderService(body) {
  const fragment = clone('tpl-service');
  setText(fragment, 'message', body.message);
  setText(fragment, 'retry_after_seconds', body.retry_after_seconds);
  show(fragment, 'retry-line', Number.isFinite(body.retry_after_seconds));
  return fragment;
}

/** HTTP 422 — a client bug. Each rejection carries its own message. */
export function renderInvalid(body) {
  const fragment = clone('tpl-invalid');
  fillList(fragment, 'rejected', body.declared_facts?.rejected ?? [], (r) => {
    const node = clone('tpl-rejection');
    setText(node, 'fact', r.fact);
    setText(node, 'message', r.message);
    return node;
  });
  return fragment;
}

/** No usable response: network failure, or anything unexpected. */
export function renderTransportError(kind, code) {
  const fragment = clone('tpl-transport');
  const heading = fragment.querySelector(`.statusbox__title[data-error="${kind}"]`);
  if (heading) heading.hidden = false;
  setText(fragment, 'detail', code ? `code: ${code}` : '');
  show(fragment, 'detail', Boolean(code));
  return fragment;
}

/**
 * Shown INSTEAD of anything else when the service answers with a
 * `schema_version` this page was not built against.
 *
 * Takes the raw value rather than a message: an absent, null or unparsable
 * version is as much a mismatch as a numerically different one, and all of them
 * mean the same thing — we do not know what the fields in this body mean.
 */
export function renderVersionMismatch(expected, found) {
  const fragment = clone('tpl-version-mismatch');
  setText(fragment, 'detail', `contract: pagina v${expected} · dienst v${found ?? '?'}`);
  return fragment;
}

/** Shown INSTEAD of a result whose mandatory disclosures did not render. */
export function renderRenderFailure(code) {
  const fragment = clone('tpl-render-failure');
  setText(fragment, 'detail', `code: ${code}`);
  return fragment;
}
