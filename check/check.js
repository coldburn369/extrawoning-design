/**
 * Adrescheck controller: read the form, call POST /api/check, mount whatever
 * render.js builds from the answer.
 *
 * The split is deliberate. This file owns the transport and the page's own
 * states (idle, pending, mounted); render.js owns turning a response into DOM.
 * Neither writes a Dutch sentence — the copy lives in sections/*.html.
 *
 * INPUT. The form asks for postcode + huisnummer + toevoeging, and since
 * schema_version 2 it sends them exactly that way: the API takes components and
 * refuses to answer unless the address it resolves matches them. Joining them
 * into one string here used to be this file's job; it no longer is, and must not
 * become it again — the join is what made "which dwelling did you mean?"
 * unanswerable on the server. See check/SECTIONS.md.
 *
 * ANSWERS (schema_version 3). Bucket B is answerable, and the answers go over in
 * ONE request. The limiter allows five checks per ten minutes, so a page that
 * re-checked after each answer would lock a user out of their own result partway
 * through filling the form in — the batching is a correctness property of this
 * file, not a nicety.
 *
 * THE ANSWERS NEVER LEAVE MEMORY. `mantelzorg_noodzakelijk` is a statement about
 * someone's health needs and the household facts describe who lives where.
 * Nothing here writes to localStorage, sessionStorage, a cookie or the URL, and
 * nothing should: a reload legitimately loses them.
 */
import { SCHEMA_VERSION, contractMatches } from './contract.js';
import {
  RenderError,
  answerableOf,
  applyAnswers,
  nextFacts,
  readAnswers,
  renderInvalid,
  renderMismatch,
  renderRenderFailure,
  renderResult,
  renderService,
  renderTerminal,
  renderTransportError,
  renderVersionMismatch,
  ruleIdsIn,
  showRejections,
  showServiceMessage,
} from './render.js';

const ENDPOINT = '/api/check';
const LEADS_ENDPOINT = '/api/leads';

// Comfortably past the app's own per-request budget (8 s) and nginx's
// proxy_read_timeout (15 s), so a slow-but-alive backend gets to answer with
// its honest `source_timeout` body rather than being cut off here and reported
// as a network failure.
const CLIENT_TIMEOUT_MS = 30_000;

// The three statuses that carry no activities. Anything else with HTTP 200 and
// no `ok` is treated as unexpected rather than guessed at.
const TERMINAL_STATUSES = new Set(['out_of_scope', 'address_not_found', 'source_timeout']);

const POSTCODE_RE = /^[1-9][0-9]{3}[A-Z]{2}$/;
const HUISNUMMER_RE = /^[0-9]{1,5}$/;
const TOEVOEGING_RE = /^[A-Za-z0-9-]{1,6}$/;

const form = document.getElementById('check-form');
const submit = document.getElementById('check-submit');
const errorBox = document.getElementById('check-form-error');
const pending = document.getElementById('check-pending');
const pendingAddress = document.getElementById('check-pending-address');
const result = document.getElementById('check-result');

const fields = {
  postcode: document.getElementById('postcode'),
  huisnummer: document.getElementById('huisnummer'),
  toevoeging: document.getElementById('toevoeging'),
};

let inFlight = null;

/**
 * Everything the page remembers between requests. IN MEMORY ONLY — see the file
 * header. `answers` accumulates across re-checks so a question that left bucket
 * B keeps the answer that moved it there; `openRules` is what makes "these
 * points are now tested" showable after the next response arrives.
 */
const state = {
  asked: null,
  answers: {},
  questions: [],
  openRules: new Set(),
};

/* ---- form state ---------------------------------------------------------- */

function showFieldError(name) {
  for (const el of errorBox.querySelectorAll('[data-invalid]')) {
    el.hidden = el.dataset.invalid !== name;
  }
  errorBox.hidden = false;
  // Drop any previous result. The user has changed the input, so leaving the
  // last address's verdict on screen invites reading it against what is now in
  // the fields.
  clearResult();
  fields[name]?.focus();
}

function clearFieldError() {
  errorBox.hidden = true;
  for (const el of errorBox.querySelectorAll('[data-invalid]')) el.hidden = true;
}

/**
 * A new address is a new subject. The answers describe a household at a specific
 * dwelling, so carrying them to another address would attach someone's living
 * arrangements to a house they did not ask about.
 */
function clearResult() {
  result.replaceChildren();
  state.answers = {};
  state.questions = [];
  state.openRules = new Set();
}

/**
 * The three fields -> the request body, unchanged in shape.
 *
 * Since schema_version 2 the API takes the components separately and refuses to
 * answer unless the address it resolves matches them (ADR-0015). This page no
 * longer joins them into a string: the join was the step that made "which
 * dwelling did you mean?" unanswerable, and the server must not have to guess
 * where the house number ends.
 *
 * Postcode is upper-cased and stripped of its internal space, toevoeging
 * upper-cased. That is the only transformation this page performs on address
 * input, and the API normalises again on its own side regardless.
 */
function readForm() {
  const postcode = fields.postcode.value.replace(/\s+/g, '').toUpperCase();
  const huisnummer = fields.huisnummer.value.trim();
  const toevoeging = fields.toevoeging.value.replace(/\s+/g, '').toUpperCase();

  if (!POSTCODE_RE.test(postcode)) return showFieldError('postcode'), null;
  if (!HUISNUMMER_RE.test(huisnummer)) return showFieldError('huisnummer'), null;
  if (toevoeging && !TOEVOEGING_RE.test(toevoeging)) return showFieldError('toevoeging'), null;

  clearFieldError();
  return { postcode, huisnummer: Number(huisnummer), toevoeging: toevoeging || null };
}

/** What the user typed, for the pending line only — never presented as an answer. */
function askedLabel({ postcode, huisnummer, toevoeging }) {
  return `${postcode} ${huisnummer}${toevoeging ?? ''}`;
}

/**
 * `keepResult` is what makes a re-check non-destructive: the answers a user is
 * waiting on stay on screen, so a refusal can point at the field that caused it
 * instead of at an empty page.
 */
function setPending(label, { keepResult = false } = {}) {
  pendingAddress.textContent = label;
  pending.hidden = !label;
  submit.disabled = Boolean(label);
  for (const button of result.querySelectorAll('[data-slot="answers-submit"]')) {
    button.disabled = Boolean(label);
  }
  if (label && !keepResult) clearResult();
}

/**
 * Put a resolved address back into the form and re-run it.
 *
 * The API returns `address_resolved` in exactly the shape `CheckRequest` takes,
 * so this is a copy, not a translation. Offering it matters: a refusal that
 * forces retyping is how a user ends up accepting whatever their second guess
 * resolves to.
 */
function resubmit(resolved) {
  fields.postcode.value = resolved.postcode;
  fields.huisnummer.value = String(resolved.huisnummer);
  fields.toevoeging.value = resolved.toevoeging ?? '';
  clearFieldError();
  run({
    postcode: resolved.postcode,
    huisnummer: resolved.huisnummer,
    toevoeging: resolved.toevoeging ?? null,
  });
}

function mount(fragment) {
  result.replaceChildren(fragment);
  wireAnswerForm();
  wireLeadForm();
  result.querySelector('.result')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ---- email capture ------------------------------------------------------- */

/**
 * The lead form on a result.
 *
 * WHAT LEAVES THE BROWSER: the email, the gemeentecode and the activities, and
 * the two anti-abuse fields. NOT the address — `POST /api/leads` has no field
 * for one, and that absence is what lets the privacy page say the email list and
 * the address cache never meet.
 *
 * WHAT IS STORED IN THE BROWSER: nothing. Same rule as the answers, and for a
 * stronger reason — an email address left in localStorage outlives the session,
 * the tab and the user's intention to give it to us. A reload legitimately
 * empties the field.
 *
 * BOTH OUTCOMES GET A STATE. This is the one action on the page that captures
 * demand; a submit that quietly does nothing is worse than an error message. The
 * success and refusal sentences are the API's own (`LeadResponse.message`); the
 * only sentence this page owns is the one for "no usable response arrived",
 * because then there is nothing of theirs to quote.
 */
function wireLeadForm() {
  const leadForm = result.querySelector('[data-slot="lead-form"]');
  if (!leadForm) return;

  const button = leadForm.querySelector('[data-slot="lead-submit"]');
  const email = leadForm.querySelector('input[name="email"]');
  const trap = leadForm.querySelector('input[name="website"]');
  const message = result.querySelector('[data-slot="lead-message"]');
  const failure = result.querySelector('[data-slot="lead-error"]');

  // When the form appeared, for the server's fill-time check. A timestamp, not a
  // stored value: it lives in this closure and dies with the mount.
  const shownAt = Date.now();

  const say = (text) => {
    message.textContent = text ?? '';
    message.hidden = !text;
    failure.hidden = Boolean(text);
  };
  const fail = () => {
    message.hidden = true;
    failure.hidden = false;
  };

  leadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    say(null);
    failure.hidden = true;

    try {
      const response = await fetch(LEADS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email: email.value.trim(),
          gemeentecode: leadForm.dataset.gemeentecode || null,
          activity: leadForm.dataset.activity || null,
          website: trap.value,
          form_elapsed_ms: Date.now() - shownAt,
        }),
      });
      const body = await response.json();
      if (!body?.message) {
        // A 2xx with nothing to show is as unusable as a 500. Never treat it as
        // success: the user would walk away believing they are on the list.
        fail();
        return;
      }
      say(body.message);
      // Only a real acceptance retires the form. `invalid_email` leaves it up
      // with the address still in it, because the next step is to correct it.
      if (body.status === 'ok') leadForm.hidden = true;
    } catch {
      fail();
    } finally {
      button.disabled = leadForm.hidden;
    }
  });
}

/* ---- the answer form ----------------------------------------------------- */

/**
 * Attach behaviour to a freshly mounted form: restore the accumulated answers,
 * apply the `ask_if` conditions, and submit ONCE for all of them.
 *
 * `readAnswers` is what applies the conditions — one walk in DOM order, because
 * a conditional question depends on an answer given above it and the API emits
 * questions in its declared asking order so that a single pass is enough.
 */
function wireAnswerForm() {
  const answerForm = result.querySelector('[data-slot="answers-form"]');
  if (!answerForm) return;

  applyAnswers(result, state.questions, state.answers);
  readAnswers(result, state.questions);

  answerForm.addEventListener('input', () => readAnswers(result, state.questions));
  answerForm.addEventListener('change', () => readAnswers(result, state.questions));
  answerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.asked) return;
    state.answers = nextFacts(result, state.questions, state.answers);
    run(state.asked, state.answers);
  });
}

/* ---- transport ----------------------------------------------------------- */

/**
 * One request. Resolves to {status, body} where `status` is the HTTP code and
 * `body` is the parsed JSON, or throws so the caller can report a transport
 * failure — the page never invents a result when there is no answer.
 */
async function postCheck(asked, facts, signal) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    // Omitted entirely when there is nothing to send: the API distinguishes "I
    // supplied nothing" from "I supplied things and none were used", and an
    // empty object would claim the second.
    body: JSON.stringify(facts && Object.keys(facts).length ? { ...asked, facts } : asked),
    signal,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    throw new RenderError('body');
  }
  return { status: response.status, body };
}

/**
 * A refusal or a service message on a RE-CHECK, handled without unmounting.
 *
 * Returns true when it was handled in place. Answers stay in the form, and each
 * rejection lands on the field that caused it carrying the API's own message. A
 * rejection this page cannot place falls through to the dedicated 422 view
 * rather than disappearing — a message the user never sees is exactly the
 * silent-ignore failure the 422 exists to prevent.
 */
function handleInPlace({ status, body }) {
  if (!result.querySelector('[data-slot="answers-form"]')) return false;
  if (status === 422) {
    const rejected = body?.declared_facts?.rejected ?? [];
    showServiceMessage(result, null);
    // A 422 with nothing named would leave the form looking accepted. Fall
    // through to the dedicated view, which at least says nothing was tested.
    return rejected.length > 0 && showRejections(result, rejected).length === 0;
  }
  if (status === 429 || status === 503) {
    showRejections(result, []);
    showServiceMessage(result, body);
    // ALWAYS handled here — the 422's treatment, which this used to lack. It
    // previously returned `Boolean(body.message)`, so a service response with no
    // message fell through to a view that REPLACES the result, taking the user's
    // answers with it. Being locked out of your own half-filled form is the
    // exact failure the one-submit batching exists to avoid, and it happened on
    // the one path where the service had already told us it was overloaded.
    // `showServiceMessage` renders the fallback when there is no sentence to
    // quote, so keeping the form never means saying nothing.
    return true;
  }
  return false;
}

/**
 * HTTP status + body -> a fragment. Split out from the request so the mapping
 * from wire outcome to template is readable in one screen.
 */
function fragmentFor({ status, body }) {
  // BEFORE any other field is read. Once the contract version is wrong, every
  // subsequent branch here is reading fields whose meaning this page is only
  // guessing at — including `status`, which is what selects the template.
  if (!contractMatches(body)) {
    return renderVersionMismatch(SCHEMA_VERSION, body?.schema_version);
  }
  if (status === 422) return renderInvalid(body);
  if (status === 429 || status === 503) return renderService(body);
  if (status !== 200) return renderTransportError('unexpected', `http-${status}`);
  if (body?.status === 'ok') return renderResult(body, { previouslyOpen: state.openRules });
  // Its own branch, above the terminal statuses: a mismatch is the one non-`ok`
  // outcome that carries something actionable — the address we DID find.
  if (body?.status === 'address_mismatch') return renderMismatch(body, resubmit);
  if (TERMINAL_STATUSES.has(body?.status)) return renderTerminal(body);
  return renderTransportError('unexpected', 'status');
}

async function run(asked, facts = null) {
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  const timer = setTimeout(() => controller.abort('timeout'), CLIENT_TIMEOUT_MS);
  const isRecheck = Boolean(facts);
  setPending(askedLabel(asked), { keepResult: isRecheck });
  if (!isRecheck) state.asked = asked;

  try {
    const answer = await postCheck(asked, facts, controller.signal);
    if (isRecheck && contractMatches(answer.body) && handleInPlace(answer)) return;
    const fragment = fragmentFor(answer);
    remember(answer);
    mount(fragment);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
    mount(errorFragment(error, controller.signal));
  } finally {
    clearTimeout(timer);
    if (inFlight === controller) inFlight = null;
    setPending(null, { keepResult: true });
  }
}

/**
 * What this response leaves behind for the next one.
 *
 * `openRules` is captured BEFORE the fragment is mounted, from the response we
 * are about to replace — it is what lets the next result say which points the
 * user's answers moved out of bucket B.
 */
function remember({ status, body }) {
  if (status !== 200 || body?.status !== 'ok' || !contractMatches(body)) return;
  // BOTH channels: open questions and claimable exemptions share one form, so
  // they share one list. `readAnswers` / `applyAnswers` / `nextFacts` all drive
  // off this, and an offer missing from it would render as a control whose value
  // is never read — a button that does nothing.
  state.questions = answerableOf(body);
  state.openRules = ruleIdsIn(body, 'needs_user_input');
}

/**
 * A RenderError means we HAD an answer and could not show it completely, which
 * is the one case where showing nothing is the correct outcome. Anything else
 * means no usable answer arrived at all.
 */
function errorFragment(error, signal) {
  if (error instanceof RenderError) return renderRenderFailure(error.code);
  if (signal.aborted) return renderTransportError('network', 'timeout');
  return renderTransportError('network', 'fetch');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const asked = readForm();
  if (asked) run(asked);
});

for (const field of Object.values(fields)) {
  field.addEventListener('input', clearFieldError);
}
