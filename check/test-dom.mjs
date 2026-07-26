/**
 * A deliberately tiny DOM shim for the check-page tests.
 *
 * NOT a dependency. This repo has none and does not acquire one for a test, so
 * this implements exactly what `render.js` and `check.js` touch and nothing
 * else: `getElementById`, `template.content.cloneNode`, the selector forms those
 * two files actually use, `textContent`, `classList`, `hidden`, `dataset`, and
 * enough of `<input>` (`name` / `type` / `value` / `checked`) that a form can be
 * filled in and read back.
 *
 * It lives in its own file because two test files now need it. Extracting it is
 * also what stopped the second one from growing a *second*, subtly different
 * shim — which would have let a test pass against a DOM the browser does not
 * have.
 *
 * The one thing to keep true: every capability added here must be one the real
 * DOM has, with the same semantics. A shim that is more permissive than a
 * browser turns a green test into a false one.
 */
import { readFileSync } from 'node:fs';

/** Attributes an element reflects to and from a JS property, as the DOM does. */
const REFLECTED = ['name', 'type', 'value', 'step', 'id'];

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export class El {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = [];
    this.classes = new Set((attrs.class ?? '').split(/\s+/).filter(Boolean));
    this._text = '';
    this.hidden = 'hidden' in attrs;
    this.checked = 'checked' in attrs;
    this.disabled = 'disabled' in attrs;
    this.listeners = {};

    // `dataset` writes through to the attributes, because that is where the
    // selectors read them from — `[data-question]` must see what
    // `field.dataset.question = …` wrote, exactly as in a browser.
    this.dataset = new Proxy(
      {},
      {
        get: (_, key) => this.attrs[`data-${kebab(String(key))}`],
        set: (_, key, value) => {
          this.attrs[`data-${kebab(String(key))}`] = String(value);
          return true;
        },
        has: (_, key) => `data-${kebab(String(key))}` in this.attrs,
        ownKeys: () =>
          Object.keys(this.attrs)
            .filter((a) => a.startsWith('data-'))
            .map((a) => camel(a.slice(5))),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      },
    );

    for (const prop of REFLECTED) {
      Object.defineProperty(this, prop, {
        get: () => this.attrs[prop] ?? '',
        set: (v) => {
          this.attrs[prop] = String(v);
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  get classList() {
    return {
      add: (c) => this.classes.add(c),
      remove: (c) => this.classes.delete(c),
      contains: (c) => this.classes.has(c),
    };
  }

  /* Attribute reads. Neither shipped file uses these — the templates set the
     attributes and the renderer reads them through `dataset` and the reflected
     properties. The TESTS need them, though: `tabindex`, `aria-hidden` and
     `autocomplete` are exactly the sort of attribute that is load-bearing
     precisely because nothing in the JS touches it, and a honeypot whose
     `tabindex="-1"` silently disappeared would still pass every other check. */
  getAttribute(name) {
    return name in this.attrs ? this.attrs[name] : null;
  }

  hasAttribute(name) {
    return name in this.attrs;
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

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  /** Dispatch to this element's own listeners. No bubbling — nothing needs it. */
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] ?? []) fn({ preventDefault() {}, ...event });
  }

  click() {
    this.dispatch('click');
  }

  scrollIntoView() {}

  get descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants]);
  }

  /**
   * One compound selector: optional tag, any number of classes, any number of
   * attribute predicates (`[a]`, `[a="v"]`, `[a~="v"]`), and `:checked`.
   */
  matches(sel) {
    let rest = sel;
    const tag = rest.match(/^[a-z][a-z0-9-]*/i);
    if (tag) {
      if (this.tag !== tag[0]) return false;
      rest = rest.slice(tag[0].length);
    }
    for (const [, attr, op, value] of rest.matchAll(
      /\[([a-z-]+)(?:([~^$*|]?=)"([^"]*)")?\]/gi,
    )) {
      const actual = this.attrs[attr];
      if (actual === undefined) return false;
      if (!op) continue;
      if (op === '=' && actual !== value) return false;
      if (op === '~=' && !actual.split(/\s+/).includes(value)) return false;
    }
    if (rest.includes(':checked') && !this.checked) return false;
    for (const [, cls] of rest.replace(/\[[^\]]*\]/g, '').matchAll(/\.([a-z0-9_-]+)/gi)) {
      if (!this.classes.has(cls)) return false;
    }
    return true;
  }

  querySelectorAll(sel) {
    // Descendant combinators only; split on whitespace that is not inside `[…]`.
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

export class Fragment extends El {
  constructor() {
    super('#fragment');
    this.isFragment = true;
  }
}

/**
 * Minimal well-formed-HTML walker: enough for templates.html, which is hand
 * written and fully closed. Void elements other than `<input>` are not used.
 */
export function parse(html) {
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
    if (!selfClose && tag !== 'input') stack.push(el);
  }
  return root;
}

/**
 * Install `globalThis.document` (and `CSS.escape`) backed by the real
 * `sections/templates.html`. Returns the template map so a test can inspect it.
 */
export function installDom(templatesPath) {
  const parsed = parse(readFileSync(templatesPath, 'utf8'));
  const templates = new Map();

  const deep = (node) => {
    const copy = new El(node.tag, { ...node.attrs });
    copy.hidden = node.hidden;
    copy.checked = node.checked;
    copy._text = node._text;
    copy.append(...node.children.map(deep));
    return copy;
  };
  const cloneInto = (node) => {
    const frag = new Fragment();
    frag.append(...node.children.map(deep));
    return frag;
  };

  for (const node of parsed.descendants) {
    if (node.tag === 'template' && node.attrs.id) templates.set(node.attrs.id, node);
  }
  for (const t of templates.values()) t.content = { cloneNode: () => cloneInto(t) };

  globalThis.document = { getElementById: (id) => templates.get(id) ?? null };
  // Fact names are `[a-z0-9_]`, so escaping is a no-op here — but render.js calls
  // it, and a shim that omitted it would pass a test the browser would fail.
  globalThis.CSS = { escape: (s) => String(s).replace(/([^\w-])/g, '\\$1') };
  return templates;
}
