import { describe, expect, it } from 'vitest';
import { newRunId, newSessionId, nextElementId, parseElementRef } from './ids.js';

describe('id helpers', () => {
  it('generates unique, prefixed session and run ids', () => {
    expect(newSessionId()).toMatch(/^cs_/);
    expect(newRunId()).toMatch(/^run_/);
    const ids = new Set(Array.from({ length: 100 }, () => newSessionId()));
    expect(ids.size).toBe(100);
  });

  it('nextElementId is 1-based and monotonic over current ids and high-water mark', () => {
    expect(nextElementId([])).toBe(1);
    expect(nextElementId([1, 2, 3])).toBe(4);
    // gaps from removals do not cause reuse
    expect(nextElementId([2, 3])).toBe(4);
    // high-water mark prevents reuse when the top id was removed
    expect(nextElementId([1], 2)).toBe(3);
    expect(nextElementId([], 5)).toBe(6);
  });

  it('parses #N references in several forms', () => {
    expect(parseElementRef('#3')).toBe(3);
    expect(parseElementRef('3')).toBe(3);
    expect(parseElementRef('# 12')).toBe(12);
    expect(parseElementRef('#0')).toBeUndefined();
    expect(parseElementRef('#-1')).toBeUndefined();
    expect(parseElementRef('abc')).toBeUndefined();
  });
});
