# ExtraWoning — website & design system

Static site, no framework. Three things live here:
1. **`design-system/`** — the token-based design system (source of truth for all styling).
2. **`landing/`** — the marketing landing page, built on the design system.
3. **`extrawoning-loader.html`** — the brand logo loader→reveal animation (self-contained).

No build step is needed to *preview* — `serve.py` resolves the page's includes
on the fly. `build.py` exists only to flatten everything for deploy.

ExtraWoning is a Dutch prop-tech brand: it tells homeowners whether their house is a candidate for a permitted *extra woning* (extra dwelling). Site copy is **Dutch**.

## Run / preview

Use the in-app Browser pane, never Bash, for servers.

- `preview_start` with name **`extrawoning-static`** (config in `.claude/launch.json`), then open `/landing/index.html` on the port it reports. `autoPort` is on, so if another session already holds 8124 you get a free port instead — read it from the `preview_start` result, don't assume 8124.
- Or standalone: `python serve.py 8124`

**Do NOT use `python -m http.server`** — it resets connections on parallel image bursts (`net::ERR_CONNECTION_RESET`, images randomly fail to decode). `serve.py` fixes this: threaded, `request_queue_size=128`, HTTP/1.1 keep-alive, correct `.webp` MIME. It also resolves the `<!--#include -->` directives that keep the page split into partials.

The dev server is a background process tied to the session; it gets torn down on idle/reset. Just `preview_start` again — it's not crashing.

**Deploy build:** `python build.py` → `dist/` (includes resolved, the 11 section stylesheets concatenated into one, optimised assets only). `dist/` mirrors the source URL structure, so every relative path keeps working.

## Design system (`design-system/`)

- **`TOKENS.md`** — flat cheat-sheet of every token name, grouped by tier. **Read this instead of `tokens.css` when you just need a name.** Only open `tokens.css` itself when changing a token's value.
- **`tokens.css`** — three tiers. **Components may only use Tier 2 (semantic, `--color-*`, `--space-*`, `--text-*`…) and Tier 3 (`--button-*`, `--card-*`…). Never a raw hex, never a Tier-1 `--ew-*` primitive.**
  - Semantic colors are declared **once** via CSS `light-dark()`; the theme toggle flips only `color-scheme` on `:root[data-theme]`. There is no duplicated dark-mode block — don't add one.
  - Baseline-2024 CSS (`light-dark()`): Chrome/Edge 123+, FF 120+, Safari 17.5+.
- **`check.mjs`** — structural lint for the landing page; exits non-zero on failure. **Run `node design-system/check.mjs` before calling any change done.** It catches undefined tokens, Tier-1 leaks, raw hex, `<use>` with no matching `<symbol>`, missing asset files, broken includes, and icons the stroke list doesn't cover — i.e. the gotchas below, for a fraction of a screenshot's cost. Warnings (dead/unstyled classes) don't fail it.
- **`verify-contrast.mjs`** — WCAG contrast budget, exits non-zero on failure. **Run `node design-system/verify-contrast.mjs` after any color change; it must stay green.** Add new color pairs to it when you add tokens.
- **`preview.html`** — token gallery; itself uses only Tier 2/3 (doubles as a conformance check).
- **Two faces, split by job.** `--font-display` = **Manrope** (headlines + figures; ties to the wordmark). `--font-body` = **Inter** (body, UI — the open-source SF Pro counterpart, so Windows matches macOS). Both are Latin-subset woff2 in `design-system/fonts/` (129 KB total, SIL OFL 1.1 — the licence files must ship with them); upstream originals sit unshipped in `fonts/src/`. Re-subset with `node design-system/subset-fonts.mjs` after copy changes. **SF Pro cannot be embedded** — Apple's licence covers mocking up Apple-platform UI only; `system-ui` is how macOS gets it legally.
- **Type is two scales.** `--display-lg/md/sm` (fluid, for headlines) and `--text-*` (UI scale, for data and labels). Headlines take the display scale; `.lead` is 19px. Never set reading copy at `--text-sm` or below — that was the original page's core problem.
- **Size display type for its container.** `h2` defaults to `--display-sm` (34px), not the big size: most h2s sit in 300–480px columns and long Dutch headlines wrapped to 6 lines at 56px. `.h2--loud` opts into `--display-md` for short, full-width headlines only.
- Accent has three roles, split for contrast — do not swap them:
  `--color-accent` (fills/mark/large graphics), `--color-accent-ui` (borders/focus on light), `--color-text-accent` (accent-colored text; the raw brand orange is only 2.7:1 on light and cannot carry small text).

## Landing page (`landing/`)

**Read `landing/SECTIONS.md` first.** It maps every section to its markup file
and its stylesheet, tracks each one's status against the concept, and lists
what's still open. That map is the whole point of the layout below — it means
a local change loads two small files instead of the whole page.

The page is deliberately split so no edit needs the whole thing in context:

```
landing/index.html          shell only — head, <link> order, include list
landing/sections/*.html     one file per section (hero, report, footer, …)
landing/css/*.css           one stylesheet per section + base.css/components.css
landing/rail.js             the examples marquee
```

Rules that are easy to get wrong:
- **Cascade order = the `<link>` order in `index.html`.** Don't reorder blind.
- **Media queries live with their section**, not in a shared responsive block. Breakpoints: `96rem` (wide), `62rem` (single column), `40rem` (phone).
- **Wide screens: grids grow, text doesn't.** Shell caps at `--layout-max` (90rem); prose is capped in `ch` per element so the measure tracks font size. The `96rem` breakpoint only shifts column ratios.
- **HTML relative paths resolve from `landing/`, not `sections/`** — partials are spliced into the shell before the browser sees them. CSS `url()` *is* relative to the stylesheet (hence `../../assets/` in `hero.css`).
- Everything uses **only Tier 2/3 tokens** — keep it that way; `check.mjs` enforces it.

Copy conflict resolution: when the pasted copy doc and the concept screenshots disagree, **the concept copy wins** (user decision). Concept is dark-themed; the page is pinned `data-theme="dark"`.

**Hero, `#hoe-het-werkt`, `#voorbeeldrapport` and `#voor-wie` are DONE** and reviewed against the concept. **Next up is `#waar-we-helpen`** (examples marquee), then trust+pricing, final CTA and footer — those are structurally present but not yet reviewed. Per-section detail, and the open questions (pricing €79 vs €395/€895, stubbed burger menu, unverified marquee speed), live in `landing/SECTIONS.md`.

## Gotchas that cost real time — read before debugging

- **Reach for `check.mjs` before the browser.** Most breakage here is structural, and the lint names it in one line. Use the browser for layout/visual questions the lint genuinely can't answer.
- **The Browser pane frequently collapses/hides.** When hidden: screenshots time out, `innerWidth` reads **0** (so every grid computes to `0px` — not a bug), AND `requestAnimationFrame`/the animation timeline **freeze** (`document.visibilityState==="hidden"`, ~1fps, `currentTime` stuck at 0). So **verify programmatically** — `getBoundingClientRect`, `getComputedStyle`, `performance.getEntriesByType('resource')` — don't trust a missing screenshot as a bug. `resize_window` with explicit `width`/`height` gives a real viewport back.
- **SVG sprite icons are stroke-drawn.** A `<use>` shadow tree inherits from the *referencing* element, NOT the sprite's parent `<g>`. So `fill:none; stroke:currentColor` must be set on the referencing element via a CSS selector list (see top of `css/base.css`). Miss it and icons render as solid black fills. When adding an icon-bearing component, add its selector to that list — `check.mjs` fails if you forget.
- **Replacing an inline `style=` with a class can silently lose.** Inline styles beat every selector; a plain `.foo` may not. `.footer__pitch` had to become `h4.footer__pitch` to out-specify `.footer__col h4`. Check the computed value after any such swap.
- **`light-dark()` is a COLOUR function.** It cannot wrap a whole `box-shadow` (or any non-colour) value — the token silently computes to nothing. Put `light-dark()` in the shadow's *colour* slot and keep the geometry fixed. This is why elevation is split into `--elevation-*` + `--surface-highlight`.
- **Never hide above-the-fold content behind a time-based animation.** `animation-fill-mode: both` holds the from-state until the document clock advances, and a stalled clock leaves the hero blank. Scroll-driven `view()` animations are safe to fade because they are geometry-driven; time-based load animations should move `transform` only.
- **`userSpaceOnUse` clipPaths misalign under CSS transforms**, and `transform: scaleX()` on a `<g>` inside one doesn't reveal in this browser. For wipes use a wide clip-rect that **slides via translate**. (Relevant to the loader and any clip-based reveal.)
- Reveal/wipe animations: use `animation-fill-mode: both` so the start-delay holds the hidden state (otherwise the element flashes visible during the delay).
- Images reported "broken" with `naturalWidth:0` but HEAD 200 → almost always the server (connection reset), not the file. Validate PNGs structurally before assuming corruption.

## Memory

Durable brand/design/loader facts live in Claude Code memory (`extrawoning-brand-and-design-system`, `extrawoning-landing-page`). This file is the *how-to-work* guide; memory holds *what's true*.
