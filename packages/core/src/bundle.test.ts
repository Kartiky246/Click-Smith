import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deserializeBundle,
  isCurrentVersion,
  parseBundle,
  serializeBundle,
  validateBundle,
} from './bundle.js';

const fixturePath = fileURLToPath(new URL('../test/fixtures/bundle.v5.json', import.meta.url));
const fixtureJson = readFileSync(fixturePath, 'utf8');

describe('bundle validation & serialization', () => {
  it('accepts the v5 fixture', () => {
    const bundle = deserializeBundle(fixtureJson);
    expect(bundle.v).toBe(5);
    expect(bundle.elements).toHaveLength(2);
    expect(bundle.elements[0]!.locator.kind).toBe('source');
    expect(bundle.elements[1]!.locator.kind).toBe('attr');
  });

  it('round-trips deterministically (stable key order)', () => {
    const bundle = deserializeBundle(fixtureJson);
    const a = serializeBundle(bundle);
    const b = serializeBundle(deserializeBundle(a));
    expect(a).toBe(b);
  });

  it('rejects a bundle with no elements', () => {
    const bundle = JSON.parse(fixtureJson);
    bundle.elements = [];
    const result = validateBundle(bundle);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown version', () => {
    const bundle = JSON.parse(fixtureJson);
    bundle.v = 4;
    expect(() => parseBundle(bundle)).toThrow(/Invalid CaptureBundle/);
    expect(isCurrentVersion(bundle)).toBe(false);
  });

  it('rejects an unknown locator kind', () => {
    const bundle = JSON.parse(fixtureJson);
    bundle.elements[0].locator = { kind: 'magic', wat: true };
    expect(validateBundle(bundle).ok).toBe(false);
  });

  it('throws on malformed JSON', () => {
    expect(() => deserializeBundle('{ not json')).toThrow(/not valid JSON/);
  });
});
