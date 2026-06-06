import type { z } from 'zod';
import type {
  AppContextSchema,
  AttrLocatorSchema,
  BehavioralLocatorSchema,
  CaptureBundleSchema,
  CapturedElementSchema,
  ConditionsSchema,
  DomLocatorSchema,
  ElementDescriptorSchema,
  ElementEnrichmentSchema,
  EnrichmentSchema,
  ExecutionModeSchema,
  ExecutionOptionsSchema,
  IsolationSchema,
  LocatorSchema,
  NearContextSchema,
  SessionSchema,
  SessionStatusSchema,
  SourceLocatorSchema,
} from './schemas.js';

export type SourceLocator = z.infer<typeof SourceLocatorSchema>;
export type AttrLocator = z.infer<typeof AttrLocatorSchema>;
export type BehavioralLocator = z.infer<typeof BehavioralLocatorSchema>;
export type DomLocator = z.infer<typeof DomLocatorSchema>;
export type Locator = z.infer<typeof LocatorSchema>;
export type LocatorKind = Locator['kind'];

export type ElementDescriptor = z.infer<typeof ElementDescriptorSchema>;
export type NearContext = z.infer<typeof NearContextSchema>;
export type Conditions = z.infer<typeof ConditionsSchema>;
export type CapturedElement = z.infer<typeof CapturedElementSchema>;

export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;
export type Isolation = z.infer<typeof IsolationSchema>;
export type ExecutionOptions = z.infer<typeof ExecutionOptionsSchema>;

export type ElementEnrichment = z.infer<typeof ElementEnrichmentSchema>;
export type Enrichment = z.infer<typeof EnrichmentSchema>;

export type AppContext = z.infer<typeof AppContextSchema>;
export type CaptureBundle = z.infer<typeof CaptureBundleSchema>;

export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type Session = z.infer<typeof SessionSchema>;

/**
 * The shape the extension sends when capturing an element — everything in a
 * {@link CapturedElement} except the daemon-assigned `id`.
 */
export type CapturedElementInput = Omit<CapturedElement, 'id'>;
