/**
 * Render the REAL captured API responses through the real templates.
 *
 * Run: `node --test check/render.test.mjs`
 *
 * The lint proves the CSS and the includes are structurally sound; it cannot
 * prove that a response actually renders. This does, against verbatim bodies
 * from the live service — including the completeness guard, which is what stands
 * between a partial render and a false legal statement on screen.
 *
 * The DOM here is a deliberately tiny shim, not a dependency: this repo has none
 * and does not acquire one for a test. It implements exactly what render.js
 * touches — getElementById, template.content.cloneNode, querySelector(All) over
 * the attribute and class selectors used, textContent, classList, hidden.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const load = (name) => JSON.parse(readFileSync(here(`./fixtures/${name}`), 'utf8'));

/* ---- the shim ------------------------------------------------------------ */

class El {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.classes = new Set((attrs.class ?? '').split(/\s+/).filter(Boolean));
    this._text = '';
    this.hidden = 'hidden' in attrs;
    this.dataset = {};
    this.listeners = {};
  }
  get classList() {
    return { add: (c) => this.classes.add(c), contains: (c) => this.classes.has(c) };
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get textContent() {
    return this._text || this.children.map((c) => c.textContent).join('');
  }
  append(...nodes) {
    for (const n of nodes) this.children.push(...(n.isFragment ? n.children : [n]));
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  click() {
    for (const fn of this.listeners.click ?? []) fn();
  }
  get descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants]);
  }
  matches(sel) {
    // supports: [data-slot="x"], .a, .a .b (descendant handled by caller)
    const attr = sel.match(/^\[([a-z-]+)="([^"]+)"\]$/);
    if (attr) return this.attrs[attr[1]] === attr[2];
    return sel.split('.').filter(Boolean).every((c) => this.classes.has(c));
  }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+(?![^[]*\])/);
    let pool = this.descendants;
    for (let i = 0; i < parts.length; i += 1) {
      const matched = pool.filter((n) => n.matches(parts[i]));
      pool = i === parts.length - 1 ? matched : matched.flatMap((n) => n.descendants);
    }
    return pool;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

class Fragment extends El {
  constructor() {
    super('#fragment');
    this.isFragment = true;
  }
}

function parse(html) {
  // Minimal well-formed-HTML walker: enough for templates.html, which is hand
  // written and fully closed. Void elements are not used in it.
  const root = new Fragment();
  const stack = [root];
  const re = /<(\/?)([a-z0-9-]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*(\/?)>|<!--[\s\S]*?-->/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith('<!--')) continue;
    const [, closing, tag, rawAttrs, selfClose] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)) attrs[a[1]] = a[2] ?? '';
    const el = new El(tag, attrs);
    stack[stack.length - 1].append(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}

function installDom() {
  const html = readFileSync(here('./sections/templates.html'), 'utf8');
  const parsed = parse(html);
  const templates = new Map();
  for (const node of parsed.descendants) {
    if (node.tag === 'template' && node.attrs.id) {
      node.content = { cloneNode: () => cloneInto(node) };
      templates.set(node.attrs.id, node);
    }
  }
  const cloneInto = (node) => {
    const frag = new Fragment();
    frag.append(...node.children.map(deep));
    return frag;
  };
  const deep = (node) => {
    const copy = new El(node.tag, { ...node.attrs });
    copy.hidden = node.hidden;
    copy._text = node._text;
    copy.append(...node.children.map(deep));
    return copy;
  };
  for (const t of templates.values()) t.content = { cloneNode: () => cloneInto(t) };
  globalThis.document = { getElementById: (id) => templates.get(id) ?? null };
}

installDom();
const { renderResult, renderMismatch, RenderError } = await import('./render.js');

/* ---- the tests ----------------------------------------------------------- */

test('a real ok response renders, completeness guard included', () => {
  const data = load('api-v2-ok.json');
  assert.equal(data.status, 'ok');
  const fragment = renderResult(data); // assertComplete throws on any shortfall
  assert.ok(fragment);
});

test('the heading is the RESOLVED address, not what was typed', () => {
  const data = load('api-v2-ok.json');
  const fragment = renderResult(data);
  const heading = fragment.querySelector('[data-slot="address_resolved"]');
  assert.equal(heading.textContent, data.address_resolved.weergavenaam);
  assert.notEqual(heading.textContent, data.address_query);
  // and the query is still shown, as the lesser line
  assert.equal(
    fragment.querySelector('[data-slot="address_query"]').textContent,
    data.address_query,
  );
});

test('every linked caveat is rendered on its own entry', () => {
  const data = load('api-v2-ok.json');
  const linked = data.activities.flatMap((a) =>
    ['decided', 'needs_user_input', 'needs_external_source'].flatMap((k) =>
      (a.buckets[k] ?? []).flatMap((e) => e.caveat_ids ?? []),
    ),
  );
  assert.ok(linked.length > 0, 'the fixture must actually exercise the linkage');
  const fragment = renderResult(data);
  assert.equal(fragment.querySelectorAll('.entry-caveat').length, linked.length);
});

test('the summary list still carries every caveat', () => {
  const data = load('api-v2-ok.json');
  const fragment = renderResult(data);
  assert.equal(fragment.querySelectorAll('.caveats .caveat').length, data.caveats.length);
});

test('a dangling caveat id refuses to render rather than dropping the flag', () => {
  const data = load('api-v2-ok.json');
  const broken = structuredClone(data);
  broken.activities[0].buckets.decided[0].caveat_ids = ['does-not-exist'];
  assert.throws(() => renderResult(broken), RenderError);
});

test('a real mismatch renders the API sentences and offers the resolved address', () => {
  const data = load('api-v2-mismatch.json');
  assert.equal(data.status, 'address_mismatch');
  let resubmitted = null;
  const fragment = renderMismatch(data, (r) => {
    resubmitted = r;
  });

  assert.equal(
    fragment.querySelector('[data-slot="statement"]').textContent,
    data.address_match.statement,
  );
  assert.equal(
    fragment.querySelector('[data-slot="consequence"]').textContent,
    data.address_match.consequence,
  );
  // no verdict anywhere
  assert.equal(fragment.querySelectorAll('.activity').length, 0);
  assert.equal(fragment.querySelectorAll('.verdict').length, 0);

  const button = fragment.querySelector('[data-slot="resubmit"]');
  if (data.address_resolved) {
    assert.equal(button.hidden, false);
    button.click();
    assert.deepEqual(resubmitted, data.address_resolved);
  } else {
    assert.equal(button.hidden, true);
  }
});

test('a mismatch without a statement refuses rather than showing an empty box', () => {
  const data = structuredClone(load('api-v2-mismatch.json'));
  data.address_match.statement = null;
  assert.throws(() => renderMismatch(data, () => {}), RenderError);
});
