import {
  pickBestLocator,
  type CapturedElementInput,
  type Conditions,
  type ElementDescriptor,
  type Locator,
  type NearContext,
} from '@clicksmith/core';

export const DEFAULT_STABLE_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'id'];

export interface BuildLocatorOptions {
  stableAttrs?: string[];
  /** Attribute name the unplugin injects. Default `data-loc`. */
  locAttr?: string;
}

/**
 * Build the **best** locator for an element following the ClickSmith priority
 * `source → attr → behavioral → dom`. Always succeeds (DOM fingerprint is the
 * guaranteed fallback).
 */
export function buildLocator(el: Element, options: BuildLocatorOptions = {}): Locator {
  return pickBestLocator(buildAllLocators(el, options))!;
}

/** Build every locator we can for an element, for ranking/inspection. */
export function buildAllLocators(el: Element, options: BuildLocatorOptions = {}): Locator[] {
  const stableAttrs = options.stableAttrs ?? DEFAULT_STABLE_ATTRS;
  const locAttr = options.locAttr ?? 'data-loc';
  const locators: Locator[] = [];

  // 1. source — from a dev-only data-loc attribute on the element or an ancestor.
  const locEl = el.closest(`[${locAttr}]`);
  const source = parseDataLoc(locEl?.getAttribute(locAttr));
  if (source) locators.push(source);

  // 2. attr — a stable, author-provided attribute.
  for (const attr of stableAttrs) {
    const value = el.getAttribute(attr);
    if (value) {
      const selector = attr === 'id' ? `#${cssEscape(value)}` : `[${attr}="${cssEscape(value)}"]`;
      locators.push({ kind: 'attr', attr, value, selector });
      break;
    }
  }

  // 3. behavioral — ARIA role + accessible name.
  const role = explicitOrImplicitRole(el);
  const name = accessibleName(el);
  if (role && name) {
    locators.push({ kind: 'behavioral', role, name, nth: nthOfRole(el, role) });
  }

  // 4. dom — structural fallback (always available).
  locators.push({ kind: 'dom', selector: cssPath(el), fingerprint: fingerprint(el) });

  return locators;
}

/** A full capture payload (everything but the daemon-assigned id). */
export function captureElement(el: Element, options: BuildLocatorOptions = {}): CapturedElementInput {
  const hints = frameworkHints(el);
  return {
    ts: new Date().toISOString(),
    locator: buildLocator(el, options),
    el: describeElement(el),
    near: nearContext(el),
    conditions: captureConditions(),
    ...(hints ? { frameworkHints: hints } : {}),
  };
}

/* --------------------------- element descriptor --------------------------- */

const KEPT_ATTRS = ['class', 'type', 'name', 'href', 'placeholder', 'aria-label', 'title', 'alt'];
const DOM_HINT_ATTRS = [
  ...DEFAULT_STABLE_ATTRS,
  'href',
  'icon-name',
  'aria-label',
  'title',
  'alt',
  'role',
  'name',
  'type',
  'placeholder',
  'for',
  'src',
  'ng-click',
  'ng-if',
  'routerlink',
  'data-loc',
];
const MAX_DOM_HINT_DEPTH = 5;
const MAX_SEARCH_TOKENS = 10;
const COMMON_SEARCH_TOKENS = new Set([
  'a',
  'button',
  'click',
  'div',
  'false',
  'icon',
  'img',
  'input',
  'label',
  'link',
  'main',
  'section',
  'span',
  'svg',
  'true',
  'use',
]);

interface CompactElementHint {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
}

interface ClickSmithDomHints {
  self: CompactElementHint;
  parent?: CompactElementHint;
  ancestors?: CompactElementHint[];
  searchTokens?: string[];
}

export function describeElement(el: Element): ElementDescriptor {
  const attrs: Record<string, string> = {};
  for (const attr of KEPT_ATTRS) {
    const v = el.getAttribute(attr);
    if (v) attrs[attr] = v;
  }
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const role = explicitOrImplicitRole(el);
  const label = accessibleName(el);
  const iconHints = detectIconHints(el);
  return {
    tag: el.tagName.toLowerCase(),
    ...(text ? { text } : {}),
    ...(role ? { role } : {}),
    ...(label ? { label } : {}),
    attrs,
    ...(iconHints.length ? { iconHints } : {}),
  };
}

function detectIconHints(el: Element): string[] {
  const hints = new Set<string>();
  if (el.tagName.toLowerCase() === 'svg' || el.querySelector('svg')) hints.add('svg');
  for (const cls of el.classList) {
    if (/icon|fa-|material-icons|lucide/i.test(cls)) hints.add(cls);
  }
  return [...hints];
}

/* ------------------------------ near context ------------------------------ */

export function nearContext(el: Element): NearContext {
  const near: NearContext = {};
  const labels = associatedLabels(el);
  if (labels.length) near.labels = labels;
  const heading = nearestHeading(el);
  if (heading) near.headings = [heading];
  const landmark = nearestLandmark(el);
  if (landmark) near.landmarks = [landmark];
  const parentText = (el.parentElement?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (parentText) near.parentText = parentText;
  return near;
}

function associatedLabels(el: Element): string[] {
  const out: string[] = [];
  const id = el.getAttribute('id');
  if (id) {
    for (const label of Array.from(el.ownerDocument.querySelectorAll(`label[for="${cssEscape(id)}"]`))) {
      const t = label.textContent?.trim();
      if (t) out.push(t);
    }
  }
  const parentLabel = el.closest('label');
  if (parentLabel?.textContent) out.push(parentLabel.textContent.trim());
  return out.slice(0, 3);
}

function nearestHeading(el: Element): string | undefined {
  let node: Element | null = el;
  while (node) {
    let sib: Element | null = node.previousElementSibling;
    while (sib) {
      if (/^H[1-6]$/.test(sib.tagName)) return sib.textContent?.trim() || undefined;
      const inner = sib.querySelector?.('h1,h2,h3,h4,h5,h6');
      if (inner) return inner.textContent?.trim() || undefined;
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return undefined;
}

function nearestLandmark(el: Element): string | undefined {
  const landmark = el.closest('nav,main,header,footer,aside,section,form,[role]');
  if (!landmark) return undefined;
  const role = landmark.getAttribute('role') ?? landmark.tagName.toLowerCase();
  const label = landmark.getAttribute('aria-label');
  return label ? `${role}:${label}` : role;
}

/* ------------------------------- conditions ------------------------------- */

export function captureConditions(): Conditions {
  const w = typeof window !== 'undefined' ? window.innerWidth || 1024 : 1024;
  const h = typeof window !== 'undefined' ? window.innerHeight || 768 : 768;
  const conditions: Conditions = { viewport: { w, h } };
  const mql = safeMatchMedia('(prefers-color-scheme: dark)');
  if (mql) conditions.theme = mql.matches ? 'dark' : 'light';
  const queries: Record<string, boolean> = {};
  for (const q of ['(max-width: 640px)', '(min-width: 1024px)', '(prefers-reduced-motion: reduce)']) {
    const m = safeMatchMedia(q);
    if (m) queries[q] = m.matches;
  }
  if (Object.keys(queries).length) conditions.mediaQueries = queries;
  return conditions;
}

function safeMatchMedia(query: string): MediaQueryList | undefined {
  try {
    return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------------- framework -------------------------------- */

function frameworkHints(el: Element): Record<string, unknown> | undefined {
  const hints: Record<string, unknown> = {};
  // React fiber keys leak a component display name in dev builds.
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactProps$')) {
      hints.react = true;
      break;
    }
  }
  hints.clicksmith = clicksmithDomHints(el);
  return Object.keys(hints).length ? hints : undefined;
}

function clicksmithDomHints(el: Element): ClickSmithDomHints {
  const parent = el.parentElement ? compactElement(el.parentElement) : undefined;
  const ancestors = compactAncestors(el);
  const searchTokens = collectSearchTokens(el, parent, ancestors);
  return {
    self: compactElement(el),
    ...(parent ? { parent } : {}),
    ...(ancestors.length ? { ancestors } : {}),
    ...(searchTokens.length ? { searchTokens } : {}),
  };
}

function compactAncestors(el: Element): CompactElementHint[] {
  const out: CompactElementHint[] = [];
  let node = el.parentElement?.parentElement ?? null;
  while (node && out.length < MAX_DOM_HINT_DEPTH) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') break;
    out.push(compactElement(node));
    node = node.parentElement;
  }
  return out;
}

function compactElement(el: Element): CompactElementHint {
  const attrs = compactAttrs(el);
  const rawText = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  const text = rawText.length <= 80 ? rawText : undefined;
  return {
    tag: el.tagName.toLowerCase(),
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(text ? { text } : {}),
  };
}

function compactAttrs(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of el.getAttributeNames()) {
    if (!isUsefulDomHintAttr(attr)) continue;
    const value = compactAttrValue(attr, el.getAttribute(attr));
    if (value) attrs[attr] = value;
    if (Object.keys(attrs).length >= 8) break;
  }
  return attrs;
}

function isUsefulDomHintAttr(attr: string): boolean {
  const name = attr.toLowerCase();
  return (
    DOM_HINT_ATTRS.includes(name) ||
    name.startsWith('data-') ||
    name.startsWith('aria-') ||
    name.includes('icon') ||
    name.includes('test')
  );
}

function compactAttrValue(attr: string, value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return undefined;
  if (attr === 'class') {
    const classes = normalized
      .split(/\s+/)
      .filter((cls) => /icon|logo|btn|button|nav|card|dashboard|header/i.test(cls))
      .slice(0, 4);
    return classes.length ? classes.join(' ') : undefined;
  }
  return normalized.slice(0, 120);
}

function collectSearchTokens(
  el: Element,
  parent: CompactElementHint | undefined,
  ancestors: CompactElementHint[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (value: string | undefined) => {
    for (const token of searchTokenVariants(value)) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(token);
      if (out.length >= MAX_SEARCH_TOKENS) return;
    }
  };

  for (const hint of [compactElement(el), parent, ...ancestors]) {
    if (!hint || out.length >= MAX_SEARCH_TOKENS) break;
    for (const [attr, value] of Object.entries(hint.attrs ?? {})) {
      if (attr === 'class') {
        for (const cls of value.split(/\s+/)) add(cls);
      } else {
        add(value);
      }
      if (out.length >= MAX_SEARCH_TOKENS) break;
    }
    add(hint.text);
  }

  const name = accessibleName(el);
  add(name);
  const near = nearContext(el);
  for (const value of [
    ...(near.labels ?? []),
    ...(near.headings ?? []),
    ...(near.landmarks ?? []),
    near.parentText,
  ]) {
    add(value);
    if (out.length >= MAX_SEARCH_TOKENS) break;
  }

  return out;
}

function searchTokenVariants(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 120) return [];

  const variants = [normalized];
  if (normalized.startsWith('#') && normalized.length > 1) variants.unshift(normalized.slice(1));
  if (normalized.includes('/')) variants.push(normalized.split('/').filter(Boolean).at(-1) ?? '');
  if (normalized.includes(':') && !normalized.includes(' ')) {
    variants.push(normalized.split(':').filter(Boolean).at(-1) ?? '');
  }

  return variants
    .map((token) => token.trim().replace(/^["'`#]+|["'`]+$/g, ''))
    .filter((token) => token.length >= 3 && token.length <= 80)
    .filter((token) => !COMMON_SEARCH_TOKENS.has(token.toLowerCase()));
}

/* -------------------------------- helpers --------------------------------- */

function parseDataLoc(value: string | null | undefined): Locator | null {
  if (!value) return null;
  // Format: "path:line:column" (column optional). Paths may contain ':' on Windows;
  // split from the right.
  const parts = value.split(':');
  if (parts.length < 2) return null;
  const column = parts.length >= 3 ? Number(parts.pop()) : undefined;
  const line = Number(parts.pop());
  const file = parts.join(':');
  if (!file || !Number.isFinite(line)) return null;
  return {
    kind: 'source',
    file,
    line,
    ...(column != null && Number.isFinite(column) ? { column } : {}),
  };
}

const IMPLICIT_ROLES: Record<string, string> = {
  a: 'link',
  button: 'button',
  input: 'textbox',
  select: 'combobox',
  textarea: 'textbox',
  nav: 'navigation',
  main: 'main',
  header: 'banner',
  footer: 'contentinfo',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  img: 'img',
};

function explicitOrImplicitRole(el: Element): string | undefined {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && !el.getAttribute('href')) return undefined;
  return IMPLICIT_ROLES[tag];
}

function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const ref = el.ownerDocument.getElementById(labelledby);
    if (ref?.textContent) return ref.textContent.trim();
  }
  const alt = el.getAttribute('alt');
  if (alt) return alt.trim();
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim();
  const text = el.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  return text.slice(0, 80);
}

function nthOfRole(el: Element, role: string): number | undefined {
  const all = Array.from(el.ownerDocument.querySelectorAll('*')).filter(
    (n) => explicitOrImplicitRole(n) === role,
  );
  const idx = all.indexOf(el);
  return idx > 0 ? idx : undefined;
}

export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < 5) {
    let selector = node.tagName.toLowerCase();
    const id = node.getAttribute('id');
    if (id) {
      parts.unshift(`#${cssEscape(id)}`);
      break;
    }
    const parent = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      if (sameTag.length > 1) {
        selector += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
    }
    parts.unshift(selector);
    node = node.parentElement;
    depth++;
  }
  return parts.join(' > ');
}

export function fingerprint(el: Element): string {
  const parts = [
    el.tagName.toLowerCase(),
    el.getAttribute('class') ?? '',
    childIndex(el),
    (el.textContent ?? '').trim().slice(0, 24),
  ].join('|');
  return djb2(parts);
}

function childIndex(el: Element): number {
  return el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0;
}

function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (hash * 33) ^ str.charCodeAt(i);
  return (hash >>> 0).toString(16);
}

function cssEscape(value: string): string {
  return value.replace(/["\\\]]/g, '\\$&');
}
