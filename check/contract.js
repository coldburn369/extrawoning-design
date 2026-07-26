/**
 * The seam between this repository and the API repository.
 *
 * These two deploy independently: `apps/woningkans` serves /api/check, this repo
 * serves the page, and neither blocks on the other. That split introduces
 * exactly one failure mode — the contract can change underneath a page that is
 * still being served — and this module is the whole of the defence against it.
 *
 * Kept DOM-free and in its own file for two reasons: check.js cannot be imported
 * outside a browser (it reaches for `document` at module scope), and the guard
 * is the one piece of page logic that deserves a test rather than a screenshot.
 * See check/version-guard.test.mjs.
 */

/**
 * The contract version this page is built against.
 *
 * Bump it in the same change that adopts the new contract, never ahead of one.
 * Bumping it early is worse than not having the guard: the page would then
 * render a contract it has not been updated for, which is the exact failure this
 * exists to prevent.
 */
export const SCHEMA_VERSION = 2;

/**
 * Does this response body speak the contract this page understands?
 *
 * Deliberately strict. An absent, null, string-typed or numerically different
 * `schema_version` are all the same fact — we do not know what the other fields
 * in this body mean — and a page that guesses is a page that renders a legal
 * statement it may be misreading. No coercion, no range, no "close enough".
 *
 * Every body the API returns carries the field on all three shapes
 * (CheckResponse, InvalidFacts, ServiceMessage), so this is answerable before
 * any other field is read.
 */
export function contractMatches(body) {
  return body?.schema_version === SCHEMA_VERSION;
}
