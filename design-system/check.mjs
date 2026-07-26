/**
 * Structural lint for the landing page — the cheap replacement for a
 * screenshot round-trip.
 *
 *     node design-system/check.mjs
 *
 * Catches the failure classes that have actually cost time on this project
 * (see the gotchas in CLAUDE.md), none of which a screenshot shows reliably
 * given that the Browser pane keeps collapsing:
 *
 *   ERRORS (exit 1)
 *     · var(--token) that nothing defines            — silently renders as nothing
 *     · Tier-1 --ew-* leaking into a component       — breaks the theming contract
 *     · raw hex outside a mask/filter                — breaks the theming contract
 *     · <use href="#id"> with no matching <symbol>   — invisible icon
 *     · src/url() pointing at a file that isn't there
 *     · icon-bearing selector missing from the stroke list in base.css
 *     · <!--#include> target that doesn't exist
 *
 *   WARNINGS (exit 0)
 *     · CSS class no HTML uses      — dead rules
 *     · HTML class no CSS styles    — usually a typo, sometimes intentional
 *
 * It does NOT check colour contrast — that's verify-contrast.mjs. Run both.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_DIR = join(ROOT, "landing", "css");
const SECTIONS_DIR = join(ROOT, "landing", "sections");
const SHELL = join(ROOT, "landing", "index.html");
const TOKENS = join(ROOT, "design-system", "tokens.css");

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${relative(ROOT, file)}: ${msg}`);
const warn = (msg) => warnings.push(msg);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p) => readFileSync(p, "utf8");
const listing = (dir, ext) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => join(dir, f)) : [];

const cssFiles = listing(CSS_DIR, ".css");
const sectionFiles = listing(SECTIONS_DIR, ".html");

if (!cssFiles.length) err(CSS_DIR, "no stylesheets found — did the css/ directory move?");
if (!sectionFiles.length) err(SECTIONS_DIR, "no section partials found — did sections/ move?");

/* ---------------------------------------------------------------------------
   Assemble the page the same way serve.py does, so every check below sees the
   real document rather than a fragment.
--------------------------------------------------------------------------- */
const INCLUDE_RE = /<!--#include\s+file="([^"]+)"\s*-->/g;

function renderIncludes(file, seen = new Set()) {
  const abs = resolve(file);
  if (seen.has(abs)) {
    err(abs, "circular include");
    return "";
  }
  seen.add(abs);
  return read(abs).replace(INCLUDE_RE, (_, rel) => {
    const target = resolve(dirname(abs), rel);
    if (!existsSync(target)) {
      err(abs, `include target not found: ${rel}`);
      return "";
    }
    return renderIncludes(target, new Set(seen));
  });
}

const html = existsSync(SHELL) ? renderIncludes(SHELL) : "";
if (!html) err(SHELL, "shell is empty or missing");

// Scan the markup with comments removed — the section files document their own
// markup in comments (`<use href="#id">`), which would otherwise read as real
// references. Strip only AFTER includes are resolved: includes are comments too.
const markup = html.replace(/<!--[\s\S]*?-->/g, "");

const allCss = cssFiles.map((f) => ({ file: f, text: read(f) }));

/* ---------------------------------------------------------------------------
   1. Every var(--x) must resolve to a definition somewhere.
--------------------------------------------------------------------------- */
const defined = new Set();
for (const src of [TOKENS, ...cssFiles]) {
  if (!existsSync(src)) continue;
  for (const m of stripComments(read(src)).matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
}

const scanVars = (text, file) => {
  for (const m of stripComments(text).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!defined.has(m[1])) err(file, `undefined token: var(${m[1]})`);
  }
};
for (const { file, text } of allCss) scanVars(text, file);
scanVars(markup, SHELL);

/* ---------------------------------------------------------------------------
   2. Tier-1 leaks and raw hex in component CSS.
   Hex is legitimate inside a mask/filter (luminance, not a brand colour).
--------------------------------------------------------------------------- */
for (const { file, text } of allCss) {
  const clean = stripComments(text);

  for (const _ of clean.matchAll(/var\(\s*--ew-/g)) {
    err(file, "Tier-1 primitive --ew-* used in a component (use a Tier 2/3 token)");
  }

  // Walk declarations so we can tell "inside a mask" from "a brand colour".
  for (const decl of clean.split(/[;{}]/)) {
    if (!/#[0-9a-f]{3,8}\b/i.test(decl)) continue;
    if (/mask|filter|-webkit-mask/i.test(decl)) continue;
    err(file, `raw hex outside a mask: ${decl.trim().slice(0, 70)}`);
  }
}

/* ---------------------------------------------------------------------------
   3. Sprite integrity — every <use href="#id"> needs a <symbol id>.
--------------------------------------------------------------------------- */
const symbols = new Set([...markup.matchAll(/<symbol[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
const usedSymbols = new Set([...markup.matchAll(/<use[^>]*\bhref="#([^"]+)"/g)].map((m) => m[1]));
for (const id of usedSymbols) {
  if (!symbols.has(id)) err(SHELL, `<use href="#${id}"> has no matching <symbol>`);
}
for (const id of symbols) {
  if (!usedSymbols.has(id)) warn(`unused sprite symbol: #${id}`);
}

/* ---------------------------------------------------------------------------
   4. The stroke-inheritance gotcha.
   A <use> shadow tree inherits from the REFERENCING element, so every element
   that references a stroke icon must be covered by the selector list in
   base.css. Miss it and the icon renders as a solid black fill.
--------------------------------------------------------------------------- */
{
  // Any rule that sets both fill:none and stroke:currentColor grants coverage —
  // the shared list in base.css is the usual home, but a component may declare
  // its own (.medallion svg does). Collect selectors from every stylesheet.
  const strokeSelectors = [];
  for (const { text } of allCss) {
    for (const rule of stripComments(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = rule[2];
      if (/fill:\s*none/.test(body) && /stroke:\s*currentColor/.test(body)) {
        strokeSelectors.push(...rule[1].split(",").map((s) => s.trim()).filter(Boolean));
      }
    }
  }

  if (!strokeSelectors.length) {
    err(join(CSS_DIR, "base.css"), "no fill:none/stroke:currentColor rule anywhere — every sprite icon will render as a solid fill");
  } else {
    // Two shapes in the list: ".ico" (the <svg> itself carries the class) and
    // ".btn svg" (an ANCESTOR carries it). Both must be honoured, so this walks
    // the document keeping a stack of open elements rather than matching the
    // <svg> tag in isolation.
    const selfClasses = new Set();      // ".ico"        -> svg's own class
    const ancestorClasses = new Set();  // ".btn svg"    -> an ancestor's class
    for (const sel of strokeSelectors) {
      const parts = sel.split(/\s+/);
      const lead = parts[0].match(/^\.([a-z0-9_-]+)$/i);
      if (!lead) continue;
      (parts.length > 1 ? ancestorClasses : selfClasses).add(lead[1]);
    }

    const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "use", "path",
                          "circle", "rect", "source", "col", "area"]);
    const stack = [];
    const TAG_RE = /<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi;
    let m;
    while ((m = TAG_RE.exec(markup))) {
      const [full, closing, tag, attrs] = m;
      const name = tag.toLowerCase();
      if (closing) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === name) { stack.length = i; break; }
        }
        continue;
      }

      const classes = (attrs.match(/\bclass="([^"]+)"/) || [, ""])[1].trim().split(/\s+/).filter(Boolean);

      if (name === "use") {
        const ref = (attrs.match(/\bhref="#([^"]+)"/) || [])[1];
        // Only stroke icons matter; the wordmark is filled, by design.
        if (ref && ref.startsWith("i-")) {
          const svg = [...stack].reverse().find((e) => e.tag === "svg");
          const okSelf = svg && svg.classes.some((c) => selfClasses.has(c));
          const okAncestor = stack.some((e) => e.classes.some((c) => ancestorClasses.has(c)));
          if (!okSelf && !okAncestor) {
            const where = svg && svg.classes.length ? `<svg class="${svg.classes.join(" ")}">` : "<svg>";
            err(SHELL, `${where} references #${ref} but no rule in the base.css stroke list covers it — icon will render as a solid fill`);
          }
        }
      }

      if (!VOID.has(name) && !full.endsWith("/>")) stack.push({ tag: name, classes });
    }
  }
}

/* ---------------------------------------------------------------------------
   5. Referenced files must exist.
--------------------------------------------------------------------------- */
// HTML src/href resolve relative to landing/ (partials are spliced into the
// shell, so the browser never sees sections/ as a base).
for (const m of markup.matchAll(/\b(?:src|href)="(?!#|https?:|data:|mailto:)([^"]+)"/g)) {
  const target = resolve(join(ROOT, "landing"), m[1]);
  if (!existsSync(target)) err(SHELL, `missing file referenced from HTML: ${m[1]}`);
}
// CSS url() resolves relative to the stylesheet itself.
for (const { file, text } of allCss) {
  for (const m of stripComments(text).matchAll(/url\(\s*["']?(?!https?:|data:)([^"')]+)/g)) {
    const target = resolve(dirname(file), m[1]);
    if (!existsSync(target)) err(file, `missing file referenced from CSS: ${m[1]}`);
  }
}

/* ---------------------------------------------------------------------------
   6. Orphans — warnings only. Some are deliberate (utilities kept for reuse),
   but an HTML class with no rule is usually a typo.
--------------------------------------------------------------------------- */
const htmlClasses = new Set(
  [...markup.matchAll(/\bclass="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/))
);
// Classes the scripts add at runtime never appear in the markup.
for (const js of listing(join(ROOT, "landing"), ".js")) {
  for (const m of read(js).matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*['"]([^'"]+)/g)) {
    htmlClasses.add(m[1]);
  }
}

const cssClasses = new Map(); // class -> file it is defined in
for (const { file, text } of allCss) {
  // Drop url(...) first: "hero_map_bg.jpg" would otherwise read as class .jpg.
  const selectorsOnly = stripComments(text).replace(/url\([^)]*\)/g, "");
  for (const m of selectorsOnly.matchAll(/\.([a-z][a-z0-9_-]*)/gi)) {
    if (!cssClasses.has(m[1])) cssClasses.set(m[1], file);
  }
}

for (const [cls, file] of cssClasses) {
  if (!htmlClasses.has(cls)) warn(`dead CSS class .${cls} (${relative(ROOT, file)}) — no HTML uses it`);
}
for (const cls of htmlClasses) {
  if (!cssClasses.has(cls)) warn(`unstyled HTML class .${cls} — no CSS rule matches it`);
}

/* ------------------------------------------------------------------------- */
const files = `${cssFiles.length} stylesheets · ${sectionFiles.length} sections`;

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ~ ${w}`);
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  x ${e}`);
  console.error(`\nFAIL  (${files})`);
  process.exit(1);
}

console.log(`\nPASS  ${files} · ${defined.size} tokens · ${symbols.size} sprite symbols`);
