/**
 * Regenerate the shipped webfont subsets.
 *
 *     npm i subset-font          # once; not committed, this is a build-time tool
 *     node design-system/subset-fonts.mjs
 *
 * Reads the upstream originals from design-system/fonts/src/ and writes Latin
 * subsets to design-system/fonts/, which is what tokens.css points at and what
 * build.py ships. The originals stay out of dist/ because build.py only copies
 * files at the top level of fonts/.
 *
 * Last run: Inter 352 KB -> 100 KB (-71%), Manrope 167 KB -> 29 KB (-82%).
 * Both keep their full variable weight axis.
 *
 * RUN THIS AFTER CHANGING PAGE COPY if the new text might introduce a glyph
 * the safety ranges below don't cover — run `python build.py` first, since the
 * character set is read from the built page.
 */
import subsetFont from 'subset-font';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = join(ROOT, 'design-system', 'fonts');
const BUILT = join(ROOT, 'dist', 'landing', 'index.html');

/* --- 1. every character the built page actually renders ------------------ */
if (!existsSync(BUILT)) {
  console.error(`no built page at ${BUILT}\nrun: python build.py`);
  process.exit(1);
}
const visible = readFileSync(BUILT, 'utf8')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')        // sprite path data is not text
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, m => ({ '&amp;': '&', '&nbsp;': ' ', '&eacute;': 'é' }[m] || ' '));
const pageChars = new Set(visible);

/* --- 2. safety margin, so a copy edit can't silently lose a glyph -------- */
const RANGES = [
  [0x20, 0xff],     // Latin-1 — á é ë ï ö ü ç ñ £ © ® ° ± · « » ¿ ×
  [0x100, 0x17f],   // Latin Extended-A — ĳ Ĳ ō ś ž
  [0x2013, 0x2015], // – — ―
  [0x2018, 0x201f], // curly quotes
  [0x2022, 0x2022], // •
  [0x2026, 0x2026], // …
  [0x20ac, 0x20ac], // €
  [0x2122, 0x2122], // ™
  [0x2190, 0x2193], // ← ↑ → ↓
  [0x2212, 0x2212], // −
  [0x2605, 0x2606], // ★ ☆ — the Trustpilot rating. Easy to lose; don't.
];
const safety = new Set();
for (const [a, b] of RANGES) for (let c = a; c <= b; c++) safety.add(String.fromCodePoint(c));

const glyphs = new Set([...pageChars, ...safety]);
const text = [...glyphs].join('');

/* Anything on the page the ranges above didn't anticipate is still kept, but
   say so — it means RANGES should probably grow. */
const unexpected = [...pageChars].filter(c => !safety.has(c) && c.codePointAt(0) > 0x7f);
if (unexpected.length) {
  console.log('NOTE — page characters outside the safety ranges (kept, but consider adding):');
  console.log('  ' + unexpected.map(c => `${c} U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(', '));
}

/* --- 3. subset ---------------------------------------------------------- */
const JOBS = [
  { src: 'src/Inter-Variable.full.woff2', out: 'Inter-Variable.woff2' },
  { src: 'src/Manrope-Variable.full.ttf', out: 'Manrope-Variable.woff2' },
];

const kb = n => (n / 1024).toFixed(0).padStart(4) + ' KB';
let totalBefore = 0, totalAfter = 0;

for (const { src, out } of JOBS) {
  const srcPath = join(FONTS, src);
  if (!existsSync(srcPath)) {
    console.error(`missing source font: ${src}`);
    process.exit(1);
  }
  const before = readFileSync(srcPath);
  const after = await subsetFont(before, text, { targetFormat: 'woff2' });
  writeFileSync(join(FONTS, out), after);
  totalBefore += before.length;
  totalAfter += after.length;
  const cut = (100 - (after.length / before.length) * 100).toFixed(0);
  console.log(`${out.padEnd(24)} ${kb(before.length)} -> ${kb(after.length)}  (-${cut}%)`);
}

console.log(`${''.padEnd(24)} ${kb(totalBefore)} -> ${kb(totalAfter)}  ` +
            `(-${(100 - (totalAfter / totalBefore) * 100).toFixed(0)}%)`);
console.log(`\nglyph set: ${glyphs.size} characters (${pageChars.size} from the page)`);
console.log('verify the variable weight axis survived — see the check in landing/SECTIONS.md');
