# @clicksmith/core

Platform-neutral shared contracts for ClickSmith. This package is the single
source of truth for the data that flows between the browser extension, the
daemon, the MCP server, and agent adapters.

> It has **no Node or browser runtime assumptions** beyond [`zod`](https://zod.dev),
> so it can be imported from a content script, a Fastify route, or a CLI alike.

## What's inside

| Module | Exports |
| --- | --- |
| `schemas` | Zod schemas: `LocatorSchema`, `CapturedElementSchema`, `ExecutionOptionsSchema`, `CaptureBundleSchema` (v5), `SessionSchema`, … |
| `types` | Inferred TS types for everything above (`Locator`, `CaptureBundle`, `Session`, …). |
| `ids` | `newSessionId`, `newRunId`, `nextElementId`, `parseElementRef`. |
| `locator` | `LOCATOR_PRIORITY`, `rankLocators`, `pickBestLocator`, `describeLocator`. |
| `session` | `createSession`, `appendElement`, `removeElement`, `finalizeSession`, `isExpired`, `touchSession`. |
| `bundle` | `validateBundle`, `parseBundle`, `serializeBundle`, `deserializeBundle`. |
| `defaults` | `DEFAULT_EXECUTION_OPTIONS`, `requiresConfirmation`, `DEFAULT_SESSION_TTL_MS`, port defaults. |
| `protocol` | HTTP DTOs (`CaptureRequest`, `SubmitRequest`, …) and the `ServerEvent` WebSocket union. |

## The capture bundle (v5)

```ts
import { CaptureBundleSchema, type CaptureBundle } from '@clicksmith/core';

const bundle: CaptureBundle = CaptureBundleSchema.parse(payload);
```

```jsonc
{
  "v": 5,
  "sessionId": "cs_…",
  "submittedAt": "2026-06-07T10:05:00.000Z",
  "prompt": "make #1 match #2's style",
  "app": { "url": "…", "route": "/pricing", "page": "Pricing" },
  "elements": [ /* CapturedElement[] */ ],
  "execution": { "mode": "plan", "isolation": "worktree", "autoApply": false },
  "enrichment": { /* optional code-review-graph context */ }
}
```

## Locator ranking

Locators are a discriminated union ranked **exactly** `source → attr → behavioral → dom`:

```ts
import { pickBestLocator } from '@clicksmith/core';

pickBestLocator([domLocator, attrLocator, sourceLocator]); // → sourceLocator
```

## Safety defaults

`plan + worktree + no auto-apply` is the immutable safe path. `requiresConfirmation()`
returns `true` for any deviation (edit mode, in-place isolation, or auto-apply), and
`confirmationReasons()` explains why — drive your confirmation UI from these.

## Scripts

```bash
pnpm build      # tsup → dist (ESM + d.ts)
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
```
