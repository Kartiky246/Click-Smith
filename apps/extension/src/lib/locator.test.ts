import { describe, expect, it, beforeEach } from 'vitest';
import { buildAllLocators, buildLocator, captureElement, describeElement, nearContext } from './locator.js';

function html(markup: string): HTMLElement {
  document.body.innerHTML = markup;
  return document.body;
}

describe('buildLocator priority (source → attr → behavioral → dom)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers a data-loc source locator above everything', () => {
    const root = html('<button data-loc="src/App.tsx:12:4" data-testid="cta">Buy</button>');
    const el = root.querySelector('button')!;
    const locator = buildLocator(el);
    expect(locator).toEqual({ kind: 'source', file: 'src/App.tsx', line: 12, column: 4 });
  });

  it('falls back to a stable attribute when no data-loc is present', () => {
    const root = html('<button data-testid="cta">Buy</button>');
    const locator = buildLocator(root.querySelector('button')!);
    expect(locator).toEqual({
      kind: 'attr',
      attr: 'data-testid',
      value: 'cta',
      selector: '[data-testid="cta"]',
    });
  });

  it('falls back to a behavioral locator (role + accessible name)', () => {
    const root = html('<div><button aria-label="Save document">💾</button></div>');
    const locator = buildLocator(root.querySelector('button')!);
    expect(locator.kind).toBe('behavioral');
    if (locator.kind === 'behavioral') {
      expect(locator.role).toBe('button');
      expect(locator.name).toBe('Save document');
    }
  });

  it('always produces a DOM fingerprint as the last resort', () => {
    const root = html('<section><div></div><div></div></section>');
    const target = root.querySelectorAll('div')[1]!;
    const locators = buildAllLocators(target);
    const dom = locators.find((l) => l.kind === 'dom');
    expect(dom).toBeTruthy();
    if (dom?.kind === 'dom') {
      expect(dom.selector).toMatch(/div:nth-of-type\(2\)/);
      expect(dom.fingerprint).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('inherits a data-loc from an ancestor when the target lacks one', () => {
    const root = html('<div data-loc="src/Card.tsx:3:0"><span>x</span></div>');
    const locator = buildLocator(root.querySelector('span')!);
    expect(locator.kind).toBe('source');
    if (locator.kind === 'source') expect(locator.file).toBe('src/Card.tsx');
  });
});

describe('descriptors & near context', () => {
  it('describes tag/text/role/label/attrs and icon hints', () => {
    const root = html('<button type="submit" class="btn icon-save">Save</button>');
    const desc = describeElement(root.querySelector('button')!);
    expect(desc.tag).toBe('button');
    expect(desc.text).toBe('Save');
    expect(desc.role).toBe('button');
    expect(desc.attrs.type).toBe('submit');
    expect(desc.iconHints).toContain('icon-save');
  });

  it('captures nearby headings and landmarks for disambiguation', () => {
    const root = html(
      '<main aria-label="Pricing"><h2>Pro plan</h2><div><button>Buy</button></div></main>',
    );
    const near = nearContext(root.querySelector('button')!);
    expect(near.headings).toContain('Pro plan');
    expect(near.landmarks?.[0]).toMatch(/main:Pricing/);
  });

  it('produces a full capture payload ready for /capture', () => {
    const root = html('<button data-testid="x">Go</button>');
    const payload = captureElement(root.querySelector('button')!);
    expect(payload.locator.kind).toBe('attr');
    expect(payload.el.tag).toBe('button');
    expect(payload.conditions.viewport.w).toBeGreaterThan(0);
    expect(typeof payload.ts).toBe('string');
  });

  it('adds compact DOM search hints for agent fast lookup', () => {
    const root = html(`
      <main aria-label="Application main content">
        <h2>For Technical Queries</h2>
        <vwo-icon icon-name="icon--dashboard">
          <svg><use href="#icon--abt-dashboard"></use></svg>
        </vwo-icon>
      </main>
    `);
    const payload = captureElement(root.querySelector('use')!);
    const hints = payload.frameworkHints?.clicksmith as
      | {
          ancestors?: Array<{ attrs?: Record<string, string>; tag: string }>;
          searchTokens?: string[];
        }
      | undefined;

    expect(hints?.searchTokens).toEqual(
      expect.arrayContaining(['icon--abt-dashboard', 'icon--dashboard', 'For Technical Queries']),
    );
    expect(hints?.ancestors?.some((ancestor) => ancestor.attrs?.['icon-name'] === 'icon--dashboard')).toBe(
      true,
    );
  });
});
