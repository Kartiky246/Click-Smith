import type { Locator, LocatorKind } from './types.js';

/**
 * The canonical locator priority, best first. This ordering is a hard contract
 * shared by the extension (which picks the best locator it can build) and the
 * agent instructions (which teach the agent to trust higher-ranked locators).
 */
export const LOCATOR_PRIORITY = ['source', 'attr', 'behavioral', 'dom'] as const;

const RANK: Record<LocatorKind, number> = {
  source: 0,
  attr: 1,
  behavioral: 2,
  dom: 3,
};

/** Numeric rank of a locator kind; lower is more precise. */
export function locatorRank(kind: LocatorKind): number {
  return RANK[kind];
}

/**
 * Comparator for `Array.prototype.sort`, ordering locators best-first per
 * {@link LOCATOR_PRIORITY}.
 */
export function compareLocators(a: Locator, b: Locator): number {
  return locatorRank(a.kind) - locatorRank(b.kind);
}

/** Return a new array of locators sorted best-first. Does not mutate input. */
export function rankLocators(locators: readonly Locator[]): Locator[] {
  return [...locators].sort(compareLocators);
}

/** The single most precise locator from a list, or `undefined` if empty. */
export function pickBestLocator(locators: readonly Locator[]): Locator | undefined {
  if (locators.length === 0) return undefined;
  return rankLocators(locators)[0];
}

/**
 * A compact, human- and agent-readable description of a locator, suitable for
 * embedding in instructions or logs.
 */
export function describeLocator(locator: Locator): string {
  switch (locator.kind) {
    case 'source':
      return `source:${locator.file}:${locator.line}${
        locator.column != null ? `:${locator.column}` : ''
      }`;
    case 'attr':
      return `attr:[${locator.attr}="${locator.value}"]`;
    case 'behavioral':
      return `role:${locator.role}${locator.name ? ` name="${locator.name}"` : ''}${
        locator.nth != null ? ` (nth=${locator.nth})` : ''
      }`;
    case 'dom':
      return `dom:${locator.selector}`;
  }
}

/** Whether a locator points directly at source (the strongest signal). */
export function isSourceResolved(locator: Locator): boolean {
  return locator.kind === 'source';
}
