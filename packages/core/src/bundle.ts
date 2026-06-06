import type { z } from 'zod';
import { CaptureBundleSchema, CURRENT_BUNDLE_VERSION } from './schemas.js';
import type { CaptureBundle } from './types.js';

export type ValidationResult =
  | { ok: true; bundle: CaptureBundle }
  | { ok: false; error: z.ZodError };

/** Validate an unknown value as a {@link CaptureBundle} without throwing. */
export function validateBundle(value: unknown): ValidationResult {
  const result = CaptureBundleSchema.safeParse(value);
  if (result.success) return { ok: true, bundle: result.data };
  return { ok: false, error: result.error };
}

/** Validate and throw on failure (with a readable message). */
export function parseBundle(value: unknown): CaptureBundle {
  const result = validateBundle(value);
  if (result.ok) return result.bundle;
  throw new Error(`Invalid CaptureBundle: ${result.error.message}`);
}

/** Deterministically serialize a bundle to JSON (stable key order, 2-space). */
export function serializeBundle(bundle: CaptureBundle): string {
  return JSON.stringify(parseBundle(bundle), stableReplacer(), 2);
}

/** Parse a JSON string into a validated bundle. */
export function deserializeBundle(json: string): CaptureBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`CaptureBundle is not valid JSON: ${(err as Error).message}`);
  }
  return parseBundle(parsed);
}

/** Whether a value claims to be the current bundle version. */
export function isCurrentVersion(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { v?: unknown }).v === CURRENT_BUNDLE_VERSION
  );
}

/**
 * A JSON.stringify replacer that emits object keys in sorted order, producing
 * byte-stable output for hashing / golden-file comparisons.
 */
function stableReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  return function (_key, value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  };
}
