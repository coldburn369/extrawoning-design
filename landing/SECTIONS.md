# Landing page map

Read this first. It tells you which two files to open for a given change, so
you never have to load the whole page to make a local edit.

> This file covers `landing/` only. The **check page** (`/check/`) is a separate
> page root with its own map: **`check/SECTIONS.md`**. It shares
> `css/base.css` and `css/components.css` from here and nothing else.

`index.html` is only a shell: `<head>`, the ordered list of stylesheets, and a
list of includes. Sections live in `sections/`, styles in `css/`.

## Sections, in page order

| # | Section | Markup | Styles | vs concept |
|---|---|---|---|---|
| — | Sprites (mark + 25 icons) | `sections/sprites.html` | — | n/a |
| — | Header + nav | `sections/header.html` | `css/header.css` | n/a |
| 1 | Hero `#adrescheck` | `sections/hero.html` | `css/hero.css` + `css/cta.css` | **DONE — user-approved** |
| 2 | Research overview `#hoe-het-werkt` | `sections/research.html` | `css/research.css` | **DONE** |
| 3 | Example report `#voorbeeldrapport` | `sections/report.html` | `css/report.css` | **DONE** |
| 4 | Investor value `#voor-wie` | `sections/investor.html` | `css/investor.css` | **DONE** |
| 5 | Examples carousel `#waar-we-helpen` | `sections/examples.html` | `css/examples.css` + `rail.js` | **next up** |
| 6 | Trust + pricing `#onze-belofte` | `sections/trust-pricing.html` | `css/trust-pricing.css` | not reviewed |
| 7 | Final CTA | `sections/final-cta.html` | `css/cta.css` | not reviewed |
| — | Footer `#inzichten` | `sections/footer.html` | `css/footer.css` | not reviewed |

Work through 5 → 7 then the footer, in order; expect layout/treatment fixes
like the earlier sections got.
When the copy doc and the concept screenshots disagree, **the concept wins**
(user decision). The concept is dark-themed; the page is pinned `data-theme="dark"`.

## Cross-cutting styles

| File | Owns |
|---|---|
| `css/base.css` | reset, `body`, `.container`/`.section`, type roles (`h1`–`h4`, `.lead`, `.muted`, `.note`, `.eyebrow`), `.stack*`, `.self-start`, `.logo`, the **sprite stroke list**, reduced-motion |
| `css/components.css` | `.btn*`, `.panel*`, `.checklist`, `.deflist`, `.bullets`, `.feature`/`.icon-tile`, `.badge`, the `.split*` grid system |
| `css/motion.css` | `.reveal` / `.reveal-group` scroll-driven entrances. **Loaded last.** |

Anything used by exactly one section belongs in that section's file, not here.

## Motion

Entrances are pure CSS via `animation-timeline: view()` — no JavaScript.
Add `.reveal` to a single element, or `.reveal-group` to a container to
stagger its children (5 steps, then they share the last).

Two rules learned the hard way:

- **Below the fold may fade; above the fold may not.** `view()` is
  geometry-driven, so an on-screen element is already at 100% progress and
  renders visible. A *time-based* load animation with `both` fill stays at its
  from-state until the document clock advances — and a stalled clock (frozen
  preview pane, backgrounded first paint) would leave the hero blank. The hero
  therefore animates **transform only**; worst case it rests 14px low.
- Reduced motion is already handled by the `!important` block in `base.css`,
  which lands every element on its END state.

## Rules

- **Hairlines are rationed.** The page went from 23 hairline borders to 11 in
  the 2026-07-25 redesign; surfaces separate by elevation (`--card-shadow`)
  and spacing instead. Before adding `1px solid var(--color-border-subtle)`,
  check whether a surface change would do. Legitimate remaining uses: the
  report's data tables, the investor divider, the accent callout, the
  featured price panel.
- **Body copy uses the display/UI split.** Headlines take `--display-*`;
  `.lead` is 19px. Don't set reading text at `--text-sm` or below.
- **Cascade order is the `<link>` order in `index.html`.** Later files may
  override earlier ones. Don't reorder without checking.
- **Media queries live with their section**, not in a shared responsive block.
  Breakpoints: `96rem` (wide — relax grid ratios), `62rem` (multi-column →
  single) and `40rem` (phone).
- **Wide screens: grids grow, text does not.** The shell caps at
  `--layout-max` (90rem/1440px); prose is bounded in `ch` at each site
  (`.lead` 56ch, `.hero__intro` 44ch). The `96rem` breakpoint only shifts
  column ratios — `.split--4` gives the artwork column the spare room,
  `.hero__grid` gives it to the house, `.report-layout` to the dashboard.
  When touching it, check no asset upscales past its natural width:
  ```js
  [...document.images].filter(i => i.getBoundingClientRect().width > i.naturalWidth)
  // must be empty — set loading='eager' first or lazy images report 0
  ```
- **Relative paths are resolved from `landing/`, not from `sections/`** — the
  partials are spliced into the shell before the browser sees them. So an image
  is `../assets/x.webp` even though the partial sits one level deeper.
  CSS `url()` *is* relative to the stylesheet, hence `../../assets/` in
  `hero.css`.
- **Tier 2/3 tokens only** — no raw hex, no `--ew-*`. Names: `../design-system/TOKENS.md`.

## Include syntax

```html
<!--#include file="sections/hero.html" -->
```

Resolved by `serve.py` on the fly (no build step to preview) and by `build.py`
when flattening for deploy. Path is relative to the including file.

## Before saying a change is done

```bash
node design-system/check.mjs
```

Catches undefined tokens, Tier-1 leaks, raw hex, missing sprite symbols,
missing assets, broken includes, and icons the stroke list doesn't cover.
After any colour change also run `node design-system/verify-contrast.mjs`.

## Known / pending

- **Fonts are Latin subsets** — Inter 100 KB, Manrope 29 KB (129 KB total, down
  from 519 KB). Originals live unshipped in `design-system/fonts/src/`.
  Regenerate after copy changes: `python build.py` then
  `node design-system/subset-fonts.mjs` (needs `npm i subset-font`).
  **After any re-subset, confirm the variable axis survived** — a stripped
  `fvar` makes every weight render identically:
  ```js
  [200,400,700].map(w => { const c=document.createElement('canvas').getContext('2d');
    c.font = `${w} 40px "Inter"`; return c.measureText('Ontdek wat').width; })
  // must be three DIFFERENT numbers
  ```
- Checklist rows were cut 42 → 33. The plan floated ~16; going further means
  deleting substantive propositions rather than trimming redundancy, which is
  a copy decision.
- `#voorbeeldrapport`: the middle "Financieel potentieel" stat is orange
  (`is-accent`) — could arguably go green. Open.
- Mobile burger menu is **stubbed** — nav just hides under 62rem
  (`.nav-toggle` exists in CSS with no markup behind it).
- Examples marquee motion is **unverified**; `SPEED = 0.35` in `rail.js` may
  need tuning.
- Pricing shows **€79** (copy doc); the concept screenshot shows
  Quickscan €395 / Check-up €895 — **unresolved, confirm with the user**.
- `.verdict .checklist li` in `css/hero.css` is dead — no element carries
  `.verdict` (the card uses `.hero-card--verdict`). Deleting it is a visual
  change (the verdict checklist would stay 14px instead of 13px), so it was
  left alone. `check.mjs` reports it as a warning.
- `.data-table` / `.table-scroll` in `css/report.css` are unused — a table
  treatment the current mockup doesn't use.
- `hero_house.webp` (wide version) is unused; `hero_house2.webp` is live.
- Assets are WebP (`ffmpeg -c:v libwebp -q:v 82`); the `*_transparent.png`
  originals stay in `/assets` as working files and are not shipped by `build.py`.
