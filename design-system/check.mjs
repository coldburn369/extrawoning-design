/**
 * Structural lint for every page in this repo — the cheap replacement for a
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
 * PAGES. Each entry below is one document root: its own index.html shell,
 * sections/ and css/. `shared` lists stylesheets a page links but does not own
 * — base.css and components.css live under landing/ and are cross-cutting.
 * Ownership matters: hex/Tier-1/url checks run over a page's OWN sheets only,
 * so a shared sheet is not reported twice, and the dead-class warning is scoped
 * to a page's own sheets so landing's rules are not called dead by the check
 * page.
 *
 * It does NOT check colour contrast — that's verify-contrast.mjs. Run both.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = join(ROOT, "design-system", "tokens.css");

const SHARED = ["base.css", "components.css"].map((f) => join(ROOT, "landing", "css", f));

const PAGES = [
  { name: "landing", dir: join(ROOT, "landing"), shared: [] },
  { name: "check", dir: join(ROOT, "check"), shared: SHARED },
  { name: "privacy", dir: join(ROOT, "privacy"), shared: SHARED },
];

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${relative(ROOT, file)}: ${msg}`);
const warn = (msg) => warnings.push(msg);

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (p) => readFileSync(p, "utf8");
const listing = (dir, ext) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => join(dir, f)) : [];

/* ---------------------------------------------------------------------------
   Resolve each page's shell the same way serve.py does, so every check below
   sees the real document rather than a fragment.
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

/** Everything a page's checks need, gathered once. */
function loadPage(page) {
  const shell = join(page.dir, "index.html");
  const own = listing(join(page.dir, "css"), ".css");
  const sections = listing(join(page.dir, "sections"), ".html");

  if (!own.length) err(join(page.dir, "css"), "no stylesheets found — did the css/ directory move?");
  if (!sections.length) err(join(page.dir, "sections"), "no section partials found — did sections/ move?");

  const html = existsSync(shell) ? renderIncludes(shell) : "";
  if (!html) err(shell, "shell is empty or missing");

  return {
    ...page,
    shell,
    sections,
    // Scan the markup with comments removed — the section files document their
    // own markup in comments (`<use href="#id">`), which would otherwise read
    // as real references. Strip only AFTER includes are resolved: includes are
    // comments too.
    markup: html.replace(/<!--[\s\S]*?-->/g, ""),
    ownCss: own.map((f) => ({ file: f, text: read(f) })),
    allCss: [...page.shared, ...own].map((f) => ({ file: f, text: read(f) })),
    scripts: listing(page.dir, ".js"),
  };
}

const pages = PAGES.filter((p) => existsSync(p.dir)).map(loadPage);
if (!pages.length) err(ROOT, "no pages found");

/* ---------------------------------------------------------------------------
   1. Every var(--x) must resolve to a definition somewhere.
   Built across ALL pages: a page may legitimately use a token another page's
   stylesheet defines (landing/css/base.css defines --container).
--------------------------------------------------------------------------- */
const defined = new Set();
for (const src of [TOKENS, ...pages.flatMap((p) => p.allCss.map((c) => c.file))]) {
  if (!existsSync(src)) continue;
  for (const m of stripComments(read(src)).matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
}

const scanVars = (text, file) => {
  for (const m of stripComments(text).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!defined.has(m[1])) err(file, `undefined token: var(${m[1]})`);
  }
};

for (const page of pages) {
  for (const { file, text } of page.ownCss) scanVars(text, file);
  scanVars(page.markup, page.shell);
}

/* ---------------------------------------------------------------------------
   2. Tier-1 leaks and raw hex in component CSS. Own sheets only — a shared
   sheet is checked once, under the page that owns it.
   Hex is legitimate inside a mask/filter (luminance, not a brand colour).
--------------------------------------------------------------------------- */
for (const page of pages) {
  for (const { file, text } of page.ownCss) {
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
}

/* ---------------------------------------------------------------------------
   3. Sprite integrity — every <use href="#id"> needs a <symbol id>.
--------------------------------------------------------------------------- */
let symbolCount = 0;
for (const page of pages) {
  const symbols = new Set([...page.markup.matchAll(/<symbol[^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const usedSymbols = new Set([...page.markup.matchAll(/<use[^>]*\bhref="#([^"]+)"/g)].map((m) => m[1]));
  symbolCount += symbols.size;
  for (const id of usedSymbols) {
    if (!symbols.has(id)) err(page.shell, `<use href="#${id}"> has no matching <symbol>`);
  }
  for (const id of symbols) {
    if (!usedSymbols.has(id)) warn(`unused sprite symbol: #${id}`);
  }
}

/* ---------------------------------------------------------------------------
   4. The stroke-inheritance gotcha.
   A <use> shadow tree inherits from the REFERENCING element, so every element
   that references a stroke icon must be covered by the selector list in
   base.css. Miss it and the icon renders as a solid black fill.
--------------------------------------------------------------------------- */
function checkStrokeCoverage(page) {
  // Any rule that sets both fill:none and stroke:currentColor grants coverage —
  // the shared list in base.css is the usual home, but a component may declare
  // its own (.medallion svg does). Collect selectors from every stylesheet the
  // page actually loads, shared ones included.
  const strokeSelectors = [];
  for (const { text } of page.allCss) {
    for (const rule of stripComments(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = rule[2];
      if (/fill:\s*none/.test(body) && /stroke:\s*currentColor/.test(body)) {
        strokeSelectors.push(...rule[1].split(",").map((s) => s.trim()).filter(Boolean));
      }
    }
  }

  // A page with no stroke icons needs no stroke list.
  if (!/<use[^>]*\bhref="#i-/.test(page.markup)) return;

  if (!strokeSelectors.length) {
    err(page.shell, "no fill:none/stroke:currentColor rule in any loaded stylesheet — every sprite icon will render as a solid fill");
    return;
  }

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
  while ((m = TAG_RE.exec(page.markup))) {
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
          err(page.shell, `${where} references #${ref} but no rule in the base.css stroke list covers it — icon will render as a solid fill`);
        }
      }
    }

    if (!VOID.has(name) && !full.endsWith("/>")) stack.push({ tag: name, classes });
  }
}
for (const page of pages) checkStrokeCoverage(page);

/* ---------------------------------------------------------------------------
   5. Referenced files must exist.
--------------------------------------------------------------------------- */
for (const page of pages) {
  // HTML src/href resolve relative to the page root (partials are spliced into
  // the shell, so the browser never sees sections/ as a base).
  for (const m of page.markup.matchAll(/\b(?:src|href)="(?!#|https?:|data:|mailto:)([^"]+)"/g)) {
    const target = resolve(page.dir, m[1]);
    if (!existsSync(target)) err(page.shell, `missing file referenced from HTML: ${m[1]}`);
  }
  // CSS url() resolves relative to the stylesheet itself.
  for (const { file, text } of page.ownCss) {
    for (const m of stripComments(text).matchAll(/url\(\s*["']?(?!https?:|data:)([^"')]+)/g)) {
      const target = resolve(dirname(file), m[1]);
      if (!existsSync(target)) err(file, `missing file referenced from CSS: ${m[1]}`);
    }
  }
}

/* ---------------------------------------------------------------------------
   6. Orphans — warnings only. Some are deliberate (utilities kept for reuse),
   but an HTML class with no rule is usually a typo.
--------------------------------------------------------------------------- */
function classesIn(sheets) {
  const found = new Map(); // class -> file it is defined in
  for (const { file, text } of sheets) {
    // Drop url(...) first: "hero_map_bg.jpg" would otherwise read as class .jpg.
    const selectorsOnly = stripComments(text).replace(/url\([^)]*\)/g, "");
    for (const m of selectorsOnly.matchAll(/\.([a-z][a-z0-9_-]*)/gi)) {
      if (!found.has(m[1])) found.set(m[1], file);
    }
  }
  return found;
}

for (const page of pages) {
  const htmlClasses = new Set(
    [...page.markup.matchAll(/\bclass="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/))
  );

  const ownClasses = classesIn(page.ownCss);
  const loadedClasses = classesIn(page.allCss);

  for (const js of page.scripts) {
    const source = read(js);
    // Classes the scripts add at runtime never appear in the markup.
    for (const m of source.matchAll(/classList\.(?:add|remove|toggle|contains)\(\s*['"]([^'"]+)/g)) {
      htmlClasses.add(m[1]);
    }
    // classList.add(MAP[key]) hides the name from the pattern above, so also
    // accept a bare string literal that EXACTLY matches a class the page's CSS
    // defines (check.js maps presentation.tone through a frozen table). Exact
    // match only, so this can silence a warning but never invent a class.
    for (const m of source.matchAll(/['"`]([A-Za-z][\w-]*)['"`]/g)) {
      if (loadedClasses.has(m[1])) htmlClasses.add(m[1]);
    }
  }

  for (const [cls, file] of ownClasses) {
    if (!htmlClasses.has(cls)) warn(`dead CSS class .${cls} (${relative(ROOT, file)}) — no HTML uses it`);
  }
  for (const cls of htmlClasses) {
    if (!loadedClasses.has(cls)) warn(`unstyled HTML class .${cls} (${page.name}) — no CSS rule matches it`);
  }
}

/* ------------------------------------------------------------------------- */
const sheetCount = pages.reduce((n, p) => n + p.ownCss.length, 0);
const sectionCount = pages.reduce((n, p) => n + p.sections.length, 0);
const files = `${pages.length} pages · ${sheetCount} stylesheets · ${sectionCount} sections`;

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

console.log(`\nPASS  ${files} · ${defined.size} tokens · ${symbolCount} sprite symbols`);
