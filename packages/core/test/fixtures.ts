import type { AppContext, CapturedElement, CapturedElementInput, Locator } from '../src/index.js';

export const sampleApp: AppContext = {
  url: 'http://localhost:5173/pricing',
  route: '/pricing',
  page: 'Pricing',
};

export function sourceLocator(overrides: Partial<Extract<Locator, { kind: 'source' }>> = {}): Locator {
  return { kind: 'source', file: 'src/components/Cta.tsx', line: 42, column: 6, ...overrides };
}

export function makeElementInput(
  overrides: Partial<CapturedElementInput> = {},
): CapturedElementInput {
  return {
    ts: '2026-06-07T10:00:00.000Z',
    locator: sourceLocator(),
    el: {
      tag: 'button',
      text: 'Get started',
      role: 'button',
      label: 'Get started',
      attrs: { class: 'btn btn-primary' },
    },
    near: { headings: ['Pricing'] },
    conditions: { viewport: { w: 1280, h: 800 }, theme: 'light' },
    ...overrides,
  };
}

export function makeElement(id: number, overrides: Partial<CapturedElement> = {}): CapturedElement {
  return { id, ...makeElementInput(), ...overrides };
}
