import { z } from 'zod';

/**
 * The current {@link CaptureBundle} schema version. Bumped whenever the wire
 * format changes in a backward-incompatible way.
 */
export const CURRENT_BUNDLE_VERSION = 5 as const;

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .describe('ISO-8601 timestamp');

/* -------------------------------------------------------------------------- */
/*                                  Locator                                   */
/* -------------------------------------------------------------------------- */

/**
 * A `source` locator is the most precise: it points at the exact file/line that
 * rendered the element, recovered from a dev-only `data-loc` attribute injected
 * by `@clicksmith/unplugin`.
 */
export const SourceLocatorSchema = z.object({
  kind: z.literal('source'),
  file: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative().optional(),
  export: z.string().optional(),
});

/** A stable, author-provided attribute such as `data-testid` or `id`. */
export const AttrLocatorSchema = z.object({
  kind: z.literal('attr'),
  attr: z.string().min(1),
  value: z.string(),
  selector: z.string().min(1),
});

/** An accessibility-based locator: ARIA role + accessible name. */
export const BehavioralLocatorSchema = z.object({
  kind: z.literal('behavioral'),
  role: z.string().min(1),
  name: z.string(),
  nth: z.number().int().nonnegative().optional(),
});

/** Last-resort structural locator: a CSS selector plus a DOM fingerprint. */
export const DomLocatorSchema = z.object({
  kind: z.literal('dom'),
  selector: z.string().min(1),
  fingerprint: z.string().min(1),
});

/**
 * Discriminated union of all locator kinds, ranked exactly
 * `source -> attr -> behavioral -> dom` (see `locator.ts`).
 */
export const LocatorSchema = z.discriminatedUnion('kind', [
  SourceLocatorSchema,
  AttrLocatorSchema,
  BehavioralLocatorSchema,
  DomLocatorSchema,
]);

/* -------------------------------------------------------------------------- */
/*                              Captured element                              */
/* -------------------------------------------------------------------------- */

export const ElementDescriptorSchema = z.object({
  tag: z.string().min(1),
  text: z.string().optional(),
  role: z.string().optional(),
  label: z.string().optional(),
  attrs: z.record(z.string()).default({}),
  iconHints: z.array(z.string()).optional(),
});

export const NearContextSchema = z.object({
  labels: z.array(z.string()).optional(),
  headings: z.array(z.string()).optional(),
  landmarks: z.array(z.string()).optional(),
  parentText: z.string().optional(),
});

export const ConditionsSchema = z.object({
  viewport: z.object({
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
  theme: z.enum(['light', 'dark']).optional(),
  mediaQueries: z.record(z.boolean()).optional(),
});

export const CapturedElementSchema = z.object({
  /** 1-based identifier surfaced to users as `#N`. Stable within a session. */
  id: z.number().int().positive(),
  ts: isoDateTime,
  locator: LocatorSchema,
  el: ElementDescriptorSchema,
  near: NearContextSchema.default({}),
  conditions: ConditionsSchema,
  screenshot: z.string().optional(),
  frameworkHints: z.record(z.unknown()).optional(),
});

/* -------------------------------------------------------------------------- */
/*                              Execution options                             */
/* -------------------------------------------------------------------------- */

export const ExecutionModeSchema = z.enum(['plan', 'edit']);
export const IsolationSchema = z.enum(['worktree', 'branch', 'inplace']);

/**
 * How a run should be executed. The defaults — `plan` + `worktree` + no
 * auto-apply — are the immutable safe path. Any deviation (edit mode, inplace
 * isolation, or auto-apply) is a risky option requiring explicit confirmation.
 */
export const ExecutionOptionsSchema = z.object({
  mode: ExecutionModeSchema.default('plan'),
  isolation: IsolationSchema.default('worktree'),
  autoApply: z.boolean().default(false),
  agentId: z.string().optional(),
  /** Git ref the sandbox should branch from. Defaults to the current HEAD. */
  baseRef: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/*                                Enrichment                                  */
/* -------------------------------------------------------------------------- */

export const ElementEnrichmentSchema = z.object({
  elementId: z.number().int().positive(),
  reviewContext: z.string().optional(),
  impactRadius: z.unknown().optional(),
  affectedFlows: z.unknown().optional(),
});

export const EnrichmentSchema = z.object({
  source: z.literal('code-review-graph'),
  perElement: z.array(ElementEnrichmentSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

/* -------------------------------------------------------------------------- */
/*                                App context                                 */
/* -------------------------------------------------------------------------- */

export const AppContextSchema = z.object({
  url: z.string().url(),
  route: z.string().min(1),
  page: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/*                               Capture bundle                               */
/* -------------------------------------------------------------------------- */

/**
 * The finalized, agent-ready payload produced when a user submits a session.
 * Version 5.
 */
export const CaptureBundleSchema = z.object({
  v: z.literal(CURRENT_BUNDLE_VERSION),
  sessionId: z.string().min(1),
  submittedAt: isoDateTime,
  prompt: z.string().min(1),
  app: AppContextSchema,
  elements: z.array(CapturedElementSchema).min(1),
  execution: ExecutionOptionsSchema,
  enrichment: EnrichmentSchema.optional(),
});

/* -------------------------------------------------------------------------- */
/*                                  Session                                   */
/* -------------------------------------------------------------------------- */

export const SessionStatusSchema = z.enum(['active', 'submitted', 'expired']);

/**
 * An in-progress capture session held by the daemon before the user submits.
 * Finalizing a session produces a {@link CaptureBundleSchema}.
 */
export const SessionSchema = z.object({
  id: z.string().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  expiresAt: isoDateTime,
  status: SessionStatusSchema.default('active'),
  app: AppContextSchema,
  elements: z.array(CapturedElementSchema).default([]),
  prompt: z.string().optional(),
  /**
   * High-water mark of element ids ever assigned. Ensures `#N` ids are never
   * reused, even after the highest-numbered element is removed.
   */
  lastElementId: z.number().int().nonnegative().default(0),
});
