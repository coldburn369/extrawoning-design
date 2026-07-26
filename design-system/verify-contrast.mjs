/* Verify the contrast budget declared in tokens.css.
   Run:  node design-system/verify-contrast.mjs
   Exits non-zero if any pair misses its target — wire this into CI. */

const T = {
  'orange-700': '#a84c11',
  'orange-600': '#d9640e',
  'orange-500': '#f2762e',
  'orange-400': '#f6813c',
  'green-700': '#2f6f45',
  'green-600': '#3f8f5c',
  'green-400': '#63c98a',
  'red-700': '#a32318',
  'red-600': '#c8351f',
  'red-400': '#f0705f',
  'clay-950': '#100f0e',
  'clay-900': '#1a1917',
  'clay-850': '#24221f',
  'clay-800': '#2b2b28',
  'clay-600': '#6b6459',
  'clay-500': '#8f897e',
  'clay-100': '#ece7de',
  'clay-50': '#faf8f4',
};

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgb(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// [label, fg, bg, minimum]  — 4.5 normal text, 3.0 non-text/UI
const CHECKS = [
  ['text        light', 'clay-800', 'clay-50', 4.5],
  ['text        dark ', 'clay-100', 'clay-900', 4.5],
  ['text-muted  light', 'clay-600', 'clay-50', 4.5],
  ['text-muted  dark ', 'clay-500', 'clay-900', 4.5],
  ['text-accent light', 'orange-700', 'clay-50', 4.5],
  ['text-accent dark ', 'orange-400', 'clay-900', 4.5],
  ['accent-ui   light', 'orange-600', 'clay-50', 3.0],
  ['accent-ui   dark ', 'orange-400', 'clay-900', 3.0],
  ['on-accent   light', 'clay-950', 'orange-500', 4.5],
  ['on-accent   dark ', 'clay-950', 'orange-400', 4.5],
  ['success-txt light', 'green-700', 'clay-50', 4.5],
  ['success-txt dark ', 'green-400', 'clay-900', 4.5],
  ['success-ui  light', 'green-600', 'clay-50', 3.0],
  // Danger — the check page's refusal colour. Carries real sentences ("Dit is
  // een weigeringsgrond"), so it is held to the 4.5 text floor, not 3.0.
  ['danger-txt  light', 'red-700', 'clay-50', 4.5],
  ['danger-txt  dark ', 'red-400', 'clay-900', 4.5],
  ['danger-ui   light', 'red-600', 'clay-50', 3.0],
  ['danger-ui   dark ', 'red-400', 'clay-900', 3.0],
  // nested panels: text must still hold on the raised dark surface
  ['text        panel', 'clay-100', 'clay-850', 4.5],
  ['text-muted  panel', 'clay-500', 'clay-850', 4.5],
  ['success-txt panel', 'green-400', 'clay-850', 4.5],
  ['text-accent panel', 'orange-400', 'clay-850', 4.5],
  ['danger-txt  panel', 'red-400', 'clay-850', 4.5],
];

// Regression guards: the prototype values that failed. These SHOULD fail.
const KNOWN_BAD = [
  ['old muted   light', '#8f897e', '#faf8f4', 4.5],
  ['old muted   dark ', '#79736a', '#1a1917', 4.5],
  ['accent-as-text lt', '#f2762e', '#faf8f4', 4.5],
];

let failed = 0;
console.log('\n  extrawoning — contrast budget\n');
for (const [label, fg, bg, min] of CHECKS) {
  const r = ratio(T[fg], T[bg]);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}  ${r.toFixed(2)}:1  (needs ${min})`
  );
}

console.log('\n  prototype values (expected to fail — kept as a guard):\n');
for (const [label, fg, bg, min] of KNOWN_BAD) {
  const r = ratio(fg, bg);
  console.log(`  ${r >= min ? '??' : 'ok'}    ${label}  ${r.toFixed(2)}:1  (needs ${min})`);
}

console.log(failed ? `\n  ${failed} pair(s) below target\n` : '\n  all pairs meet target\n');
process.exit(failed ? 1 : 0);
