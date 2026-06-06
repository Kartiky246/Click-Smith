/**
 * Platform-neutral identifier helpers. These rely only on the Web Crypto API
 * (`globalThis.crypto`), which is available in modern browsers and Node >= 20,
 * with a deterministic-enough fallback so `core` never imports `node:crypto`.
 */

function randomToken(bytes = 8): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint8Array(bytes);
    cryptoObj.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for exotic runtimes without Web Crypto.
  let out = '';
  for (let i = 0; i < bytes; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return out;
}

/** A new opaque session id, e.g. `cs_lt4f9q_a1b2c3d4`. */
export function newSessionId(now: Date = new Date()): string {
  return `cs_${now.getTime().toString(36)}_${randomToken(4)}`;
}

/** A new opaque run id, e.g. `run_lt4f9q_a1b2c3d4`. */
export function newRunId(now: Date = new Date()): string {
  return `run_${now.getTime().toString(36)}_${randomToken(4)}`;
}

/**
 * Assign the next element id for a session. Ids are 1-based, strictly
 * increasing, and never reused — even after the highest-numbered mark is
 * removed — so user-typed references like `#2` remain stable for the life of
 * the session. Pass the session's high-water mark (`lastElementId`) so removal
 * of the top id still advances the counter.
 */
export function nextElementId(existingIds: readonly number[], lastSeen = 0): number {
  return Math.max(lastSeen, ...existingIds, 0) + 1;
}

/** Parse a `#N` reference (e.g. `"#3"`, `"3"`, `"# 3"`) into a number. */
export function parseElementRef(ref: string): number | undefined {
  const match = ref.trim().match(/^#?\s*(\d+)$/);
  if (!match) return undefined;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}
