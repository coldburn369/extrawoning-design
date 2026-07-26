# Token cheat-sheet

Index of every token in `tokens.css`, so you can pick a name without reading
the 14 KB source. **Source of truth is still `tokens.css`** — if this file and
that one disagree, the CSS wins and this file needs updating.

**The one rule:** components use **Tier 2 + Tier 3 only**. Never a raw hex,
never a `--ew-*` primitive. `check.mjs` fails the build if you do.

Colours are declared once with `light-dark()`; the theme toggle flips only
`color-scheme` on `:root[data-theme]`. Values below are shown `light / dark`.

---

## Tier 2 — semantic (what components use)

### Surfaces
| Token | light / dark |
|---|---|
| `--color-page` | clay-100 `#ece7de` / clay-950 `#100f0e` |
| `--color-surface` | clay-50 `#faf8f4` / clay-900 `#1a1917` |
| `--color-surface-raised` | white / clay-850 `#24221f` |
| `--color-surface-sunken` | clay-200 `#ded8cd` / clay-950 `#100f0e` |

### Text
| Token | light / dark | note |
|---|---|---|
| `--color-text` | clay-800 `#2b2b28` / clay-100 | brand ink |
| `--color-text-muted` | clay-600 / clay-500 | 5.5:1 / 5.1:1 |
| `--color-text-accent` | orange-700 `#a84c11` / orange-400 | **accent-coloured TEXT** |
| `--color-text-on-accent` | clay-50 (both) | on an accent fill |

### Accent — three roles, do not swap
| Token | light / dark | use for |
|---|---|---|
| `--color-accent` | orange-500 `#f2762e` / orange-400 | fills, the mark, large graphics |
| `--color-accent-ui` | orange-600 / orange-400 | borders, focus rings, small indicators |
| `--color-accent-hover` | orange-700 / orange-300 | hover state |
| `--color-accent-wash` | accent @ 10% | tinted backgrounds |

> `--color-accent` is only 2.7:1 on light. It is a **graphic** colour — never
> small text or a focus ring on a light surface.

### Status (semantic, never decorative)
`--color-success` (green-600/400) · `--color-text-success` (green-700/400) ·
`--color-success-wash` (success @ 12%)

### Lines & effects
`--color-border-subtle` (ink-a12 / white-a09) · `--color-border-strong`
(clay-300 / white-a14) · `--color-glow` · `--color-sheen`

### Focus
`--focus-ring` = `2px solid var(--color-accent-ui)` · `--focus-ring-offset` = `2px`

### Type — TWO SCALES

**Two faces, split by job:**

| Token | Face | Used by |
|---|---|---|
| `--font-display` | **Manrope** — 29 KB | `h1`–`h4`, `.verdict-title`, `.value-figure`, `.price__amount` |
| `--font-body` | **Inter** — 100 KB | `body`, `.btn`, inputs — everything else inherits |
| `--font-mono` | system mono — 0 KB | `.eyebrow`, table captions, `.badge` |

Both are Latin subsets (129 KB total, down from 519 KB) with the full variable
weight axis intact. Regenerate: `node design-system/subset-fonts.mjs`.

Manrope is a display face — it ties the page to the wordmark (Manrope SemiBold)
but reads startup-generic when it sets a whole page at reading sizes. Inter
carries body copy: it is the open-source counterpart to SF Pro, so Windows
renders like macOS. **SF Pro itself cannot be used** — Apple's licence covers
mocking up Apple-platform UI, not webfont embedding. `system-ui` sits behind
both stacks, which is how macOS gets real SF Pro for free.

Weight: `--weight-regular` 400 · `--weight-medium` 500 · `--weight-semibold` 600 (the wordmark) · `--weight-bold` 700

**Display scale — fluid, for headlines. This is the page's voice.**

| Token | Range | Use |
|---|---|---|
| `--display-lg` | 44 → 72px | the hero, once per page (`h1`) |
| `--display-md` | 30 → 44px | **opt-in** `.h2--loud` — short copy, full-width column only |
| `--display-sm` | 26 → 34px | the **default** `h2`, verdict titles, price figures |

**Size display type for its container, not for impact.** Most `h2`s on this
page sit in 300–480px grid columns with long Dutch headlines. Measured across
every `h2`: at 56px the worst wrapped to **6 lines**; at 34px they all fit in
3. That is why `h2` defaults to `--display-sm` and the big size is opt-in.

`--leading-display` 1.06 is for the hero only — `h2` uses `--leading-tight`,
because looser leading suits smaller multi-line type. `--tracking-display` is
−0.02em (−0.035em read cramped at large sizes).

**UI scale — for data, labels and captions.** Don't set body copy in these.

`--text-2xs` 11px · `--text-xs` 13px · `--text-sm` 14px · `--text-base` **17px** ·
`--text-md` 19px · `--text-lg` 23px · `--text-xl` 28px · `--text-2xl` 33px ·
`--text-3xl` 40px · `--text-4xl` 48px

> The page previously set **73% of its type at ≤14px**, which is why it read as
> a dashboard. `.lead` — the main reading style — is now 19px, not 14px.

- Leading: `--leading-display` 1.04 · `--leading-tight` 1.15 · `--leading-snug` 1.3 · `--leading-normal` 1.6 · `--leading-relaxed` 1.75
- Tracking: `--tracking-display` -0.035em · `--tracking-tight` -0.02em · `--tracking-normal` 0 · `--tracking-wide` 0.14em · `--tracking-wider` 0.22em

### Space — 4px base
`--space-0` 0 · `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 ·
`--space-5` 24 · `--space-6` 32 · `--space-7` 48 · `--space-8` 64 · `--space-9` 96 ·
`--space-10` 120 · `--space-11` 160

`--section-gap` — fluid 64 → 120px. Use for section padding; `.section` already does.

### Radius
`--radius-xs` 4 · `--radius-sm` 10 · `--radius-md` 16 · `--radius-lg` 24 (cards) ·
`--radius-xl` 32 (hero/feature slabs) · `--radius-full` 999 (all buttons and inputs)

### Elevation — geometry fixed, colour theme-varying

`light-dark()` is a **colour** function; it cannot wrap a whole shadow value.
So elevation is split in two, and they are applied **together**:

| Token | What it does |
|---|---|
| `--elevation-1/2/3` | the cast shadow — strong on light, subtle on dark |
| `--surface-highlight` | hairline top highlight; **this** is what makes a surface look raised on dark. Transparent on light. |
| `--elevation-float` | real cast shadow for elements floating over artwork (hero cards) |

`--card-shadow` is already `var(--elevation-2), var(--surface-highlight)` — use
that on panels rather than composing it yourself.

### Atmosphere
`--color-bloom` — accent at 9%, for the wide radial glows behind the hero and
final CTA. Depth on a near-black page comes from this, not from shadows.

### Motion
- Easing: `--ease-settle` (logo reveal) · `--ease-standard` (UI state) · `--ease-trace` (travelling light)
- Duration: `--duration-fast` 180ms · `--duration-base` 320ms · `--duration-slow` 720ms · `--duration-trace` 1600ms
- Principles: content resolves left → right; the accent carries activity;
  reduced-motion resolves to the END state, never a jump.

### Layering
`--z-base` 0 · `--z-sticky` 100 · `--z-overlay` 200 · `--z-modal` 300 · `--z-toast` 400

---

## Tier 3 — component tokens (re-skin without touching component CSS)

**Button (ghost/pill):** `--button-font` `--button-size` `--button-tracking`
`--button-padding` `--button-radius` `--button-fg` `--button-border`
`--button-fg-hover` `--button-border-hover` `--button-bg-selected` `--button-transition`

**Card / stage:** `--card-bg` `--card-border` `--card-radius` `--card-shadow` `--card-padding`

> `--card-border` is now **`0 solid transparent`** by default. Panels read as
> raised surfaces, not outlined boxes. Set a border locally on the rare
> component that genuinely needs an edge — currently only `.panel--accent`
> (a callout) and `.price--featured` (must beat its neighbour).

**Status readout:** `--status-font` `--status-size` `--status-tracking` `--status-fg` `--status-dot`

**Brand mark / loader:** `--mark-color` `--mark-glow` `--mark-sheen`
`--mark-trace-ease` `--mark-trace-duration`

---

## Tier 1 — primitives (reference only, never use in a component)

Orange `--ew-orange-700|600|500|400|300` · Green `--ew-green-700|600|400` ·
Clay `--ew-white` `--ew-clay-950|900|850|800|700|600|500|400|300|200|100|50` ·
Alphas `--ew-ink-a12|a06` `--ew-white-a09|a14` ·
Effects `--ew-glow-light` `--ew-glow-dark` `--ew-sheen`

The steps exist for **contrast** reasons, not variety: each is the lightest
value that still passes at its job.

---

## Layout

`--layout-max` = **90rem** (1440px) — the shell width. `landing/css/base.css`
aliases it as `--container` so section stylesheets can keep using that name.

**This is a shell width, not a reading width.** Prose is capped separately and
in `ch` at each site — `.lead` 56ch, `.hero__intro` 44ch, `.disclaimer` 90ch —
because a `ch` cap tracks font size and a container cap cannot. That split is
the whole wide-screen strategy:

> Let **grids and media** grow. Keep **text columns** fixed.

Scale everything uniformly instead and a 2560px monitor gets 200-character
lines. There is one wide breakpoint, `min-width: 96rem` (1536px), which changes
column *ratios* only — the container is already at its ceiling by then. It
lives with each section (`components.css`, `hero.css`, `report.css`).

## After any colour change

```bash
node design-system/verify-contrast.mjs
```

Must stay green. Add new colour pairs to that script when you add tokens.
