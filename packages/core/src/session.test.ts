import { describe, expect, it } from 'vitest';
import {
  appendElement,
  createSession,
  finalizeSession,
  findElement,
  isExpired,
  removeElement,
  touchSession,
} from './session.js';
import { makeElementInput, sampleApp } from '../test/fixtures.js';

const now = new Date('2026-06-07T10:00:00.000Z');

describe('session lifecycle', () => {
  it('creates an active, empty session with a 24h default expiry', () => {
    const s = createSession({ app: sampleApp, now });
    expect(s.status).toBe('active');
    expect(s.elements).toEqual([]);
    expect(new Date(s.expiresAt).getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('assigns 1-based, strictly increasing element ids', () => {
    let s = createSession({ app: sampleApp, now });
    const r1 = appendElement(s, makeElementInput(), now);
    const r2 = appendElement(r1.session, makeElementInput(), now);
    expect(r1.element.id).toBe(1);
    expect(r2.element.id).toBe(2);
    s = r2.session;
    expect(s.elements.map((e) => e.id)).toEqual([1, 2]);
  });

  it('never reuses ids after removal (stable #N references)', () => {
    let s = createSession({ app: sampleApp, now });
    s = appendElement(s, makeElementInput(), now).session;
    s = appendElement(s, makeElementInput(), now).session;
    s = removeElement(s, 1, now).session;
    const added = appendElement(s, makeElementInput(), now);
    // remaining #2 keeps its id; new element becomes #3, never reusing #1
    expect(added.session.elements.map((e) => e.id)).toEqual([2, 3]);
  });

  it('does not reuse an id even when the HIGHEST mark is removed', () => {
    let s = createSession({ app: sampleApp, now });
    s = appendElement(s, makeElementInput(), now).session; // #1
    s = appendElement(s, makeElementInput(), now).session; // #2
    s = removeElement(s, 2, now).session; // remove the top id
    const added = appendElement(s, makeElementInput(), now);
    expect(added.element.id).toBe(3); // high-water mark advances, never reuses #2
  });

  it('reports whether removal changed anything', () => {
    let s = createSession({ app: sampleApp, now });
    s = appendElement(s, makeElementInput(), now).session;
    expect(removeElement(s, 99, now).removed).toBe(false);
    expect(removeElement(s, 1, now).removed).toBe(true);
  });

  it('finds elements by id', () => {
    let s = createSession({ app: sampleApp, now });
    s = appendElement(s, makeElementInput(), now).session;
    expect(findElement(s, 1)?.id).toBe(1);
    expect(findElement(s, 2)).toBeUndefined();
  });

  it('expires unfinished sessions past their ttl, but never submitted ones', () => {
    const s = createSession({ app: sampleApp, now, ttlMs: 1000 });
    expect(isExpired(s, new Date(now.getTime() + 500))).toBe(false);
    expect(isExpired(s, new Date(now.getTime() + 2000))).toBe(true);
    const submitted = { ...s, status: 'submitted' as const };
    expect(isExpired(submitted, new Date(now.getTime() + 2000))).toBe(false);
  });

  it('touchSession slides the expiry forward', () => {
    const s = createSession({ app: sampleApp, now, ttlMs: 1000 });
    const later = new Date(now.getTime() + 5000);
    const t = touchSession(s, later, 1000);
    expect(new Date(t.expiresAt).getTime()).toBe(later.getTime() + 1000);
  });

  describe('finalizeSession', () => {
    it('produces a valid v5 bundle with defaults', () => {
      let s = createSession({ app: sampleApp, now });
      s = appendElement(s, makeElementInput(), now).session;
      const bundle = finalizeSession(s, { prompt: 'make it pop', submittedAt: now });
      expect(bundle.v).toBe(5);
      expect(bundle.prompt).toBe('make it pop');
      expect(bundle.execution).toEqual({ mode: 'plan', isolation: 'worktree', autoApply: false });
      expect(bundle.elements).toHaveLength(1);
    });

    it('throws when there are no elements', () => {
      const s = createSession({ app: sampleApp, now });
      expect(() => finalizeSession(s, { prompt: 'x' })).toThrow(/no captured elements/);
    });

    it('throws on an empty prompt', () => {
      let s = createSession({ app: sampleApp, now });
      s = appendElement(s, makeElementInput(), now).session;
      expect(() => finalizeSession(s, { prompt: '   ' })).toThrow(/prompt is empty/);
    });
  });
});
