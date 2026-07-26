/**
 * Adrescheck controller: read the form, call POST /api/check, mount whatever
 * render.js builds from the answer.
 *
 * The split is deliberate. This file owns the transport and the page's own
 * states (idle, pending, mounted); render.js owns turning a response into DOM.
 * Neither writes a Dutch sentence — the copy lives in sections/*.html.
 *
 * INPUT. The landing hero asks for postcode + huisnummer because that geocodes
 * far more reliably than free text, and the API takes a single address string.
 * Joining them is therefore a client-side concern and lives in composeAddress()
 * below. Verified against real Zaanstad addresses including huisletter and
 * toevoeging cases — see check/SECTIONS.md.
 */
import { SCHEMA_VERSION, contractMatches } from './contract.js';
import {
  RenderError,
  renderInvalid,
  renderRenderFailure,
  renderResult,
  renderService,
  renderTerminal,
  renderTransportError,
  renderVersionMismatch,
} from './render.js';

const ENDPOINT = '/api/check';

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

/* ---- form state ---------------------------------------------------------- */

function showFieldError(name) {
  for (const el of errorBox.querySelectorAll('[data-invalid]')) {
    el.hidden = el.dataset.invalid !== name;
  }
  errorBox.hidden = false;
  // Drop any previous result. The user has changed the input, so leaving the
  // last address's verdict on screen invites reading it against what is now in
  // the fields.
  result.replaceChildren();
  fields[name]?.focus();
}

function clearFieldError() {
  errorBox.hidden = true;
  for (const el of errorBox.querySelectorAll('[data-invalid]')) el.hidden = true;
}

/**
 * The three fields -> the one string the API takes.
 *
 * Postcode is upper-cased and stripped of its internal space; huisletter and
 * toevoeging are appended directly to the number ("1501CM 50A-A"). That is the
 * shape the PDOK Locatieserver resolves best, and it is the only transformation
 * this page performs on user input.
 */
function composeAddress({ postcode, huisnummer, toevoeging }) {
  return `${postcode} ${huisnummer}${toevoeging}`;
}

/** Returns the composed address, or null after showing which field is wrong. */
function readForm() {
  const postcode = fields.postcode.value.replace(/\s+/g, '').toUpperCase();
  const huisnummer = fields.huisnummer.value.trim();
  const toevoeging = fields.toevoeging.value.replace(/\s+/g, '').toUpperCase();

  if (!POSTCODE_RE.test(postcode)) return showFieldError('postcode'), null;
  if (!HUISNUMMER_RE.test(huisnummer)) return showFieldError('huisnummer'), null;
  if (toevoeging && !TOEVOEGING_RE.test(toevoeging)) return showFieldError('toevoeging'), null;

  clearFieldError();
  return composeAddress({ postcode, huisnummer, toevoeging });
}

function setPending(address) {
  pendingAddress.textContent = address;
  pending.hidden = !address;
  submit.disabled = Boolean(address);
  if (address) result.replaceChildren();
}

function mount(fragment) {
  result.replaceChildren(fragment);
  result.querySelector('.result')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ---- transport ----------------------------------------------------------- */

/**
 * One request. Resolves to {status, body} where `status` is the HTTP code and
 * `body` is the parsed JSON, or throws so the caller can report a transport
 * failure — the page never invents a result when there is no answer.
 */
async function postCheck(address, signal) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ address }),
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
  if (body?.status === 'ok') return renderResult(body);
  if (TERMINAL_STATUSES.has(body?.status)) return renderTerminal(body);
  return renderTransportError('unexpected', 'status');
}

async function run(address) {
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  const timer = setTimeout(() => controller.abort('timeout'), CLIENT_TIMEOUT_MS);
  setPending(address);

  try {
    mount(fragmentFor(await postCheck(address, controller.signal)));
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
    mount(errorFragment(error, controller.signal));
  } finally {
    clearTimeout(timer);
    if (inFlight === controller) inFlight = null;
    setPending(null);
  }
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
  const address = readForm();
  if (address) run(address);
});

for (const field of Object.values(fields)) {
  field.addEventListener('input', clearFieldError);
}
