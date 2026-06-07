# @clicksmith/extension

The ClickSmith browser extension, built with [WXT](https://wxt.dev) for MV3
(Chrome + Firefox). It talks **only** to the loopback daemon
(`http://127.0.0.1:<port>`) and never invokes agents or reads your repo directly.

## Architecture

```
content script  ──messages──►  background worker  ──HTTP/WS──►  daemon (127.0.0.1)
   (capture +                    (the only part that
    overlay UI)                   touches the network)
popup ──messages──►  background worker
```

The background service worker is the sole network boundary — content scripts run
in the page and would be subject to its CSP, so all daemon I/O is proxied.

## Key modules

| Path                            | Role                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/locator.ts`            | Builds the best locator (`source → attr → behavioral → dom`), element descriptor, near-context, and conditions. Fully unit-tested. |
| `src/lib/daemon-client.ts`      | HTTP + auto-reconnecting WebSocket client for the daemon.                                                                          |
| `src/lib/overlay.ts`            | The focused capture overlay, prompt composer, collapsed terminal stream, and run status (shadow DOM).                              |
| `src/lib/messages.ts`           | The content/popup ↔ background message protocol.                                                                                   |
| `src/entrypoints/background.ts` | Daemon bridge + agent state + enforced edit/inplace submission defaults.                                                           |
| `src/entrypoints/content.ts`    | Alt+Click capture + overlay wiring + direct agent handoff.                                                                         |
| `src/entrypoints/popup/`        | Pick the agent and show daemon status.                                                                                             |

## Develop

```bash
pnpm wxt:prepare      # generate WXT types (.wxt/)
pnpm dev              # Chrome dev with HMR
pnpm dev:firefox
pnpm build            # production build → .output/chrome-mv3
pnpm test             # vitest unit tests for the locator pipeline
pnpm typecheck        # tsc over the pure lib (src/lib)
```

## Testing

The locator pipeline — the highest-value, framework-agnostic logic — is unit
tested with vitest + happy-dom (`src/lib/locator.test.ts`): priority ordering,
ancestor `data-loc` inheritance, attribute fallback, behavioral and DOM
fallbacks, descriptors, and near-context.

End-to-end coverage (Alt+Click, cross-route session persistence, target removal,
submit streaming, collapsed terminal logs, and inplace edit handoff) is intended
to run via Playwright + WXT's extension test runner against the `demo-vite` app
and a real daemon.
