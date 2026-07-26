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

function buildEntry(entry) {
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

function buildActivity(activity) {
  const node = clone('tpl-activity');

  setText(node, 'activity', activity.activity);
  setText(node, 'verdict_label', activity.verdict_label);
  setText(node, 'verdict_statement', activity.verdict_statement);

  for (const [key, blockSlot] of BUCKETS) {
    const entries = activity.buckets?.[key] ?? [];
    fillList(node, key, entries, buildEntry);
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

  const disclaimer = fragment.querySelector('.disclosure--disclaimer [data-slot="disclaimer"]');
  if (!disclaimer?.textContent.trim()) throw new RenderError('disclaimer');

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

/** status === "ok": the full result. */
export function renderResult(data) {
  const fragment = clone('tpl-result');
  setText(fragment, 'address', data.address);
  setText(fragment, 'gemeente', data.gemeente);
  setText(fragment, 'gemeentecode', data.gemeentecode);
  show(fragment, 'gemeente-line', Boolean(data.gemeente));

  renderDisclosures(fragment, data);
  fillList(fragment, 'activities', data.activities ?? [], buildActivity);

  assertComplete(fragment, data);
  return fragment;
}

/** status is out_of_scope / address_not_found / source_timeout. */
export function renderTerminal(data) {
  const fragment = clone('tpl-status');
  setText(fragment, 'address', data.address);

  const heading = fragment.querySelector(`.statusbox__title[data-status="${data.status}"]`);
  if (!heading) throw new RenderError(data.status);
  heading.hidden = false;

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
