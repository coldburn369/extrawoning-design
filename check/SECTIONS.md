# Check page map

The address check: postcode + huisnummer in, the API's own verdict out.
Read this before editing anything under `check/`.

`index.html` is only a shell. Markup lives in `sections/`, styles in `css/`,
behaviour in two ES modules at the page root.

| File | Owns |
|---|---|
| `sections/form.html` | header, intro, the address bar, the pending state, the result mount |
| `sections/templates.html` | every `<template>` the renderer clones — **and all of the page's own Dutch** |
| `css/check.css` | page shell, the address bar, the pending panel |
| `css/result.css` | disclosures, verdict, buckets, entries, **the tone table** |
| `check.js` | form → compose address → POST → mount. Transport and page state. |
| `render.js` | response → detached DOM fragment, plus the completeness guard |

Shared: `../design-system/tokens.css`, `../landing/css/base.css`,
`../landing/css/components.css`. This page does **not** load `landing/css/cta.css`
— the address bar is reproduced in `css/check.css` with a third segment.

## The rule this page exists to obey

**Every user-visible sentence comes from the API response.** `render.js` is a
renderer, not an interpreter. It must never:

- pick a colour or treatment from `status`, `kind` or `semantic` — **only from
  `presentation.tone`**;
- decide whether something is good news;
- compose, translate, summarise or **shorten** any Dutch sentence;
- compute or infer a verdict.

There is no Dutch in either JS file. Chrome copy lives in `sections/*.html`, so
"does the page write sentences?" is answered by reading two HTML files.

If the page needs a sentence the API does not send, **that is an API gap** —
raise it, do not write it in JavaScript. The open ones are listed at the bottom.

## The tone table

Nine tones, five treatments, defined in `css/result.css`. Tones share a
treatment where the law has no distinction to draw; each keeps its own class so
a re-skin is a one-line change there rather than a change in the renderer.

| tone | class | treatment | why |
|---|---|---|---|
| `cleared` | `.tone--cleared` | **green** | the only green on the page |
| `obligation` | `.tone--obligation` | accent + wash | a PASS that is **not** good news — `zst-omz-000` PASS means you need a permit |
| `blocking` | `.tone--blocking` | danger + wash | a refusal ground |
| `mitigable` | `.tone--mitigable` | danger, no wash | not in order, but there is a mitigation path |
| `disclosure` | `.tone--disclosure` | neutral | established, not approved |
| `exempt` | `.tone--exempt` | neutral | the permit duty is lifted; the underlying law is not |
| `unknown` | `.tone--unknown` | neutral | not assessed — never green, never a failure |
| `moot` | `.tone--moot` | quiet (muted) | falls away with the permit duty |
| `not_applicable` | `.tone--not-applicable` | quiet (muted) | this rule does not apply to you |

An unrecognised tone falls back to `.tone--unknown`, never to `.tone--cleared`.

`--color-danger` / `--color-text-danger` / `--color-danger-wash` were added to
the design system for this page (see `design-system/TOKENS.md`). Before that,
orange carried both "you need a permit" and "the permit is refused".

## The verdict, and why there is no meter

`likely` is unreachable by construction while the omgevingsplan layer is
unencoded — the API says so itself in `verdict_ceiling` / `verdict_ceiling_reason`.
A three-step meter would therefore draw a step the user cannot reach and read as
a failed qualification. The page renders `verdict_label` and `verdict_statement`,
and nothing else.

The verdict card is deliberately **uncoloured**. The response carries a tone per
rule entry and none for the aggregate; tinting the aggregate would be this page
deciding what the verdict means. Severity appears where it is grounded — on the
cited `blocking` entry in bucket A.

`verdict_ceiling_reason` renders **after** the buckets, never above them. On an
`unlikely` verdict the binding constraint is a real cited refusal ground, so a
ceiling notice placed above it would present a coverage gap as the reason the
answer is negative (`api/schemas.py` says exactly this).

## Buckets

A `decided` → B `needs_user_input` → C `needs_external_source`, always in that
order, each under its own heading. B and C are honest incompleteness, not
failure, so they carry no warning colour — they are set apart by surface. Each
carries an explicit note that an open point is not an approved point.

## Mandatory disclosures, and the guard

`render.js` builds the result **detached**, then `assertComplete()` checks it
against the response before it is mounted:

- `presumptions[]` and `declared_exclusions[]` rendered counts must match;
- `caveats[]` count must match;
- the disclaimer must be present and non-empty (it renders **on the result**,
  not in a footer);
- every entry's `presentation.statement` must match the source
  **character-for-character** — this is what proves nothing was truncated, the
  MOOT Bbl / goed-verhuurderschap sentence in particular.

On any mismatch the page shows `#tpl-render-failure` and **no result**. A result
without its presumptions is a false legal statement, so showing nothing is the
correct outcome.

All text lands via `textContent`, never `innerHTML`.

## Input

The API takes one address string; the form has three fields. `composeAddress()`
in `check.js` joins them as `"<POSTCODE> <nr><toevoeging>"` (postcode upper-cased,
internal space stripped). That is the only transformation applied to user input.

Verified against real Zaanstad addresses:

| input | resolves to |
|---|---|
| `1541 KL` + `46` | Boschjesstraat 46, Koog aan de Zaan |
| `1506 CS` + `1` + `A` | Zeemansstraat 1A, Zaandam (huisletter) |
| `1501 CM` + `50` + `A-A` | Zuiddijk 50A-A, Zaandam (huisletter + toevoeging) |
| `1012 AB` + `1` | Amsterdam → `out_of_scope` |

## States handled

`ok` · `out_of_scope` (lists `covered_gemeenten`) · `address_not_found` ·
`source_timeout` · HTTP 422 (per-rejection `message`) · 429 (API message +
`retry_after_seconds`) · 503 (API message) · network failure · a client-side
validation error per field. The pending state names the sources being consulted
rather than spinning blankly.

## Known / open

- **API gap — no message for the terminal statuses.** `CheckResponse` has no
  message field, so the headings for `out_of_scope` / `address_not_found` /
  `source_timeout` are chrome in `sections/templates.html`. They are the only
  outcome sentences on this page that the API does not supply.
- **API gap — the response does not echo the RESOLVED address.** `address` is
  the string we sent. The PDOK Locatieserver matches fuzzily, so a postcode +
  huisnummer that does not exist silently resolves to a neighbour, and the page
  cannot show what was actually checked. `9999ZZ 999` comes back as a real
  Utrecht address, which is also why `address_not_found` is not reachable from
  this form today.
- The page renders `questions[].prompt` read-only. Answering them (POSTing
  `facts`) is not in this slice, so the 422 path is defensive only.
- No favicon: the browser's `/favicon.ico` request 404s, as on the landing page.
- `check.mjs` covers this page — see the `PAGES` table at the top of it.
