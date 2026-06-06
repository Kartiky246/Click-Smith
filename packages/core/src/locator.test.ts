import { describe, expect, it } from 'vitest';
import {
  compareLocators,
  describeLocator,
  isSourceResolved,
  LOCATOR_PRIORITY,
  locatorRank,
  pickBestLocator,
  rankLocators,
} from './locator.js';
import type { Locator } from './types.js';

const source: Locator = { kind: 'source', file: 'a.tsx', line: 1 };
const attr: Locator = { kind: 'attr', attr: 'data-testid', value: 'x', selector: '[data-testid="x"]' };
const behavioral: Locator = { kind: 'behavioral', role: 'button', name: 'Save' };
const dom: Locator = { kind: 'dom', selector: 'div > button', fingerprint: 'abc123' };

describe('locator ranking', () => {
  it('exposes the canonical priority order', () => {
    expect(LOCATOR_PRIORITY).toEqual(['source', 'attr', 'behavioral', 'dom']);
  });

  it('ranks source best and dom worst', () => {
    expect(locatorRank('source')).toBeLessThan(locatorRank('attr'));
    expect(locatorRank('attr')).toBeLessThan(locatorRank('behavioral'));
    expect(locatorRank('behavioral')).toBeLessThan(locatorRank('dom'));
  });

  it('sorts a shuffled list best-first without mutating input', () => {
    const input = [dom, behavioral, source, attr];
    const ranked = rankLocators(input);
    expect(ranked.map((l) => l.kind)).toEqual(['source', 'attr', 'behavioral', 'dom']);
    // original untouched
    expect(input.map((l) => l.kind)).toEqual(['dom', 'behavioral', 'source', 'attr']);
  });

  it('picks the single best locator', () => {
    expect(pickBestLocator([dom, attr])?.kind).toBe('attr');
    expect(pickBestLocator([])).toBeUndefined();
  });

  it('compareLocators is a valid comparator', () => {
    expect(compareLocators(source, dom)).toBeLessThan(0);
    expect(compareLocators(dom, source)).toBeGreaterThan(0);
    expect(compareLocators(attr, attr)).toBe(0);
  });

  it('describes each locator kind compactly', () => {
    expect(describeLocator(source)).toBe('source:a.tsx:1');
    expect(describeLocator(attr)).toBe('attr:[data-testid="x"]');
    expect(describeLocator(behavioral)).toBe('role:button name="Save"');
    expect(describeLocator(dom)).toBe('dom:div > button');
  });

  it('flags source-resolved locators', () => {
    expect(isSourceResolved(source)).toBe(true);
    expect(isSourceResolved(dom)).toBe(false);
  });
});
