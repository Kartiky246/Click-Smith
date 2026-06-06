import type { CaptureBundle, Enrichment } from '@clicksmith/core';

/**
 * Pluggable, best-effort enrichment. When configured (e.g. backed by the
 * code-review-graph MCP), it resolves source locators to attach review context
 * and impact radius per element. Failures must be **non-blocking**: the run
 * manager catches errors and records them as warnings on the bundle.
 */
export interface EnrichmentProvider {
  id: string;
  enrich(bundle: CaptureBundle): Promise<Enrichment | null>;
}

/**
 * Apply an enrichment provider to a bundle, swallowing failures into warnings.
 * Returns a (possibly) new bundle; never throws.
 */
export async function enrichBundle(
  bundle: CaptureBundle,
  provider: EnrichmentProvider | undefined,
): Promise<CaptureBundle> {
  if (!provider) return bundle;
  try {
    const enrichment = await provider.enrich(bundle);
    if (!enrichment) return bundle;
    return { ...bundle, enrichment };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...bundle,
      enrichment: {
        source: 'code-review-graph',
        perElement: bundle.enrichment?.perElement ?? [],
        warnings: [...(bundle.enrichment?.warnings ?? []), `enrichment failed: ${message}`],
      },
    };
  }
}
