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
| `css/answers.css` | the answer form, and the "what your answers resolved" panel |
| `check.js` | form → POST → mount. Transport, page state, **the answers** |
| `render.js` | response → detached DOM fragment, the form, the completeness guard |
| `test-dom.mjs` | the tiny DOM shim both test files use. Not shipped to the page. |

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

## The answer form (schema_version 3)

Bucket B is answerable. Each question in `open_questions[]` renders as the
control its `kind` declares — a radio group from `choices`, a number field, a
date field — and **every label comes from the response**. The page composes no
Dutch here either: `text`, each choice `label`, and `promise` are all response
strings.

Four rules it exists to obey:

1. **ONE form, ONE submit.** Facts are request-scoped, so a question open under
   both activities gets one control (two would let a user contradict themselves
   in a single submit). And the limiter allows five checks per ten minutes: a
   page that re-checked after each answer would lock a user out of their own
   result partway through the form. The batching is correctness, not polish.
2. **One question sets its facts WHOLE.** `choice.facts` is the payload the
   server round-trips, so "Ja, als hoofdverblijf" submits hoofdverblijf AND
   woonachtig together. Splitting them is the combination the corpus forbids, and
   the server refuses it — this is why the API is question-scoped (ADR-0016).
3. **`ask_if` hides AND clears.** `verhuurder_eigen_go_m2` appears only once the
   in-gebruik-gever is woonachtig, and withdrawing that answer empties the field.
   A stale value would be a number given under one premise submitted under
   another. The hint is convenience — the server enforces the condition anyway.
4. **`sub_questions` carry a `role`.** For the pre-2021 permit: `gate` must be
   affirmative, `fact` supplies the date, `dossier` never leaves the browser. The
   date travels only when every gate says yes, because the permit must have been
   for the woningvorming itself — an early date EXEMPTs the permit duty and MOOTs
   six weigeringsgronden.

`fully_resolves: false` renders as the API's `promise` sentence under the
question, so a bucket-C question never reads as "answer this and you will know".
`verdict_ceiling_reason` still renders after the buckets on the re-check screen —
the screen where a user has just done everything asked of them is exactly where
it must not disappear.

## Claimable exemptions (schema_version 4)

A **second group inside the same form**, and the separation is the whole point.

| | `open_questions` | `claimable_exemptions` |
|---|---|---|
| the rule is | UNKNOWN — we could not test it | decided (PASS/FAIL) |
| says | "we could not test this" | "we tested it; here is a door" |
| unanswered | the point stays untested | **the verdict is unchanged and complete** |
| heading | *Beantwoord wat u zelf kunt beantwoorden* | *Vrijstellingen die u mogelijk kunt inroepen* |

The gap it closes: the buckets are keyed on what is unresolved, so a rule that
resolved carried no questions. `zst-wv-000` resolves to PASS — *you need a
permit* — and its two vrijstellingen (mantelzorg; a pre-2021 omgevingsvergunning)
were never put to anyone. See ADR-0017 in the API repo.

Four things this page must keep true:

1. **Never under the bucket-B heading.** Filing a vrijstelling as an open
   question tells a user their verdict is uncertain when it is not.
2. **Either group alone shows the form.** `api-v4-answered.json` is the case:
   bucket B empty, both offers still open. Gating on `open_questions.length` —
   what the single-block form did — makes the favourable path unreachable exactly
   when the user has done everything else asked of them.
3. **The offers are in `state.questions`.** `answerableOf()` is the union, and it
   is what `readAnswers`/`applyAnswers`/`nextFacts` drive off. An offer missing
   from it renders as a control whose value is never sent — a button that does
   nothing, on the one question that could improve the answer.
4. **Only the heading is chrome.** What the vrijstelling is (`statement`, the
   corpus text verbatim), that leaving it blank changes nothing, and what
   claiming it would do are all the response's own `offer`. An offer beside a
   verdict reads as doubt about that verdict unless something says otherwise, and
   the sentence that says otherwise is the server's.

Accent, not green and not danger: an offer is neither good news nor a fault until
the user says whether it applies to them.

### The answers never leave memory

`mantelzorg_noodzakelijk` is a statement about someone's health needs and the
household facts describe who lives where. Nothing is written to `localStorage`,
`sessionStorage`, a cookie or the URL, and `check/answers.test.mjs` asserts that
mechanically. A reload legitimately loses them. Changing the address clears them
too — they describe a household at a specific dwelling.

### A refusal keeps what was typed

A 422 on a re-check does not unmount the result. Each rejection lands on the
field that caused it carrying the API's own `message`; a rejection the page
cannot place falls through to the dedicated 422 view rather than disappearing.

**A 429/503 now gets the same treatment, which it did not before.** Two gaps
were closed:

- `handleInPlace` returned `Boolean(body.message)`, so a service response
  carrying no sentence fell through to a view that **replaces** the result —
  taking the half-filled form with it, on the one path where the service had
  already told us it was overloaded. It now always keeps the form, and
  `showServiceMessage` renders a chrome fallback when there is nothing of theirs
  to quote, so keeping the form never means saying nothing.
- The in-place path showed no `retry_after_seconds`. "Probeer het later opnieuw"
  without the countdown is the half of a 429 a user can act on, missing — and
  `tpl-service` had always shown it, which made the in-place path the worse of
  the two for no reason.

### What changed

After a re-check the page lists the rules that were in `needs_user_input` and are
now in `decided`. Both responses are in memory, the membership is the response's
own, and the panel claims nothing about what the test then FOUND — the entry
below it says that.

## The contract version

`check/contract.js` holds `SCHEMA_VERSION` and the predicate. `check.js` checks
it **before reading any other field**, including `status` — once the version is
wrong, the field that selects the template is itself a guess. On a mismatch the
page shows `#tpl-version-mismatch` and nothing else, and says nothing about the
address.

This is the seam between two repositories that deploy independently, and the one
failure mode the split introduces. Bump `SCHEMA_VERSION` in the change that
adopts the new contract, never ahead of one. `check/version-guard.test.mjs` runs
it against verbatim v1, v2 and v3 captures in `check/fixtures/`.

**v3 → v4 is the instructive one, because it was purely additive.** Every slot on
this page would have filled correctly against a v4 body while still on v3, and the
result would have looked completely normal — with the two vrijstellingen missing
and nothing on screen to say so. A silently absent offer is indistinguishable
from an address that has none. That is why an added field still gets a bump.

## Input

Since `schema_version` 2 the API takes the three fields **separately** and the
page sends them that way. It no longer joins them into a string.

That join is gone on purpose. It was the step that made "which dwelling did you
mean?" unanswerable on the server: given only `"1501CA 887"` the API had to
either guess where the house number ended or trust whatever the Locatieserver
fuzzily matched. Measured, 38 of 47 corrupted queries resolved to a different
real dwelling and returned a full verdict about it. The API now compares the
resolved postcode and `huis_nlt` against the components it was given and refuses
when they differ. **Do not reintroduce a compose step here.**

The only transformation applied to user input is upper-casing and stripping the
postcode's internal space; the API normalises again on its own side regardless.

Verified against real Zaanstad addresses:

| input | resolves to |
|---|---|
| `1541 KL` + `46` | Boschjesstraat 46, Koog aan de Zaan |
| `1506 CS` + `1` + `A` | Zeemansstraat 1A, Zaandam (huisletter) |
| `1501 CM` + `50` + `A-A` | Zuiddijk 50A-A, Zaandam (huisletter + toevoeging) |
| `1012 AB` + `1` | Amsterdam → `out_of_scope` |
| `1501 CA` + `887` | → `address_mismatch` (no such number on that postcode) |

## The resolved address is the headline

`address_query` is what was typed; `address_resolved` is the dwelling the verdict
is about. The heading shows the **resolved** one and the query sits under it,
muted.

That ordering is load-bearing. A typo that is itself a real address —
`Zuiddijk 4A` for `Zuiddijk 3A` — passes every check the server can make, because
the user typed a valid dwelling. Nothing catches it except a reader noticing the
two lines differ, so the resolved address cannot be a footnote.

## Caveats render twice, deliberately

Each bucket entry carries `caveat_ids`, resolved server-side. The page looks them
up by id and renders them inside the entry; it does not know, and must not learn,
which caveat belongs to which rule. A `Blokkade` whose basis is flagged uncertain
must carry the flag where it is read.

The summary list at the foot still carries **every** caveat, including those that
bear on nothing in particular. An id that does not resolve is a `RenderError` and
no result is shown — an entry that quietly lost its caveat looks exactly like one
that never had it.

## States handled

`ok` · **`address_mismatch`** (API statement + consequence, and a button that
resubmits `address_resolved`) · `out_of_scope` (lists `covered_gemeenten`) ·
`address_not_found` · `source_timeout` — the last three now render
`outcome.statement` + `.consequence` · HTTP 422 (per-rejection `message`, **in
place on a re-check**, in its own view otherwise) · 429 (API message +
`retry_after_seconds`, **beside the form on a re-check**) · 503 (API message) ·
**contract-version mismatch** · network failure · a client-side validation error
per field. The pending state names the sources being consulted rather than
spinning blankly, and a re-check keeps the previous result on screen while it runs.

## Checks

```
node design-system/check.mjs           # structural lint, all pages
node design-system/verify-contrast.mjs
node --test check/*.test.mjs           # version guard · render · the answer form
```

## Known / open

- ~~**API gap — no message for the terminal statuses.**~~ Closed by
  `schema_version` 3: `outcome.statement` + `outcome.consequence` for
  `out_of_scope` / `address_not_found` / `source_timeout`. There is now **no
  outcome sentence on this page that the API does not supply.**
- ~~**A 429 during a re-check loses the answers.**~~ Closed: the in-place path
  now keeps the form unconditionally and carries the countdown. A **reload** still
  loses them, and always will — they live in memory only, by design.
- ~~**API gap — the response does not echo the RESOLVED address.**~~ Closed by
  `schema_version` 2: `address_query` / `address_resolved` / `address_match`.
  `address_not_found` is now reachable and means "no hit at all"; a hit that is
  not the dwelling asked for is `address_mismatch`.
- No favicon: the browser's `/favicon.ico` request 404s, as on the landing page.
- `check.mjs` covers this page — see the `PAGES` table at the top of it.
