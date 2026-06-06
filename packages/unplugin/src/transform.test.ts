import { describe, expect, it } from 'vitest';
import { injectDataLoc } from './transform.js';

const SAMPLE = `export function Card() {
  return (
    <div className="card">
      <button onClick={onClick}>Buy</button>
      <img src="/x.png" />
    </div>
  );
}
`;

describe('injectDataLoc', () => {
  it('injects data-loc onto every host JSX opening element with file:line:column', () => {
    const result = injectDataLoc(SAMPLE, { file: 'src/Card.tsx' });
    expect(result).not.toBeNull();
    expect(result!.injected).toBe(3);
    expect(result!.code).toMatch(/<div data-loc="src\/Card\.tsx:3:4" className="card">/);
    expect(result!.code).toMatch(/<button data-loc="src\/Card\.tsx:4:6" onClick=/);
    // self-closing elements are handled
    expect(result!.code).toMatch(/<img data-loc="src\/Card\.tsx:5:6" src="\/x\.png" \/>/);
  });

  it('honors a custom attribute name', () => {
    const result = injectDataLoc('<a href="/">x</a>\n', { file: 'a.tsx', attribute: 'data-cs' });
    expect(result!.code).toMatch(/<a data-cs="a\.tsx:1:0" href="\/">/);
  });

  it('is idempotent — never adds a duplicate data-loc', () => {
    const once = injectDataLoc(SAMPLE, { file: 'src/Card.tsx' })!;
    const twice = injectDataLoc(once.code, { file: 'src/Card.tsx' });
    // Second pass finds an attribute on every element → nothing to inject.
    expect(twice).toBeNull();
    expect((once.code.match(/data-loc=/g) ?? []).length).toBe(3);
  });

  it('returns null (sourceless fallback) for unparseable input', () => {
    expect(injectDataLoc('this is { not ) valid <tsx', { file: 'x.tsx' })).toBeNull();
  });

  it('returns null when there is no JSX to annotate', () => {
    expect(injectDataLoc('export const x = 1;\n', { file: 'x.ts' })).toBeNull();
  });

  it('produces a source map', () => {
    const result = injectDataLoc(SAMPLE, { file: 'src/Card.tsx' })!;
    expect(result.map).toBeTruthy();
    expect(result.map.mappings.length).toBeGreaterThan(0);
  });
});
