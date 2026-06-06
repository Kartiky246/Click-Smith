# ClickSmith Architecture

This document is the canonical design reference for ClickSmith. It describes the four
cooperating subsystems, the data contracts that bind them, and the safety model.

## 1. The four cooperating pieces

```
┌──────────────────────┐        HTTP / WebSocket        ┌───────────────────────────┐
│   Browser extension  │  ───────────────────────────►  │          Daemon           │
│      (WXT MV3)       │   127.0.0.1:<port>             │   (single Node process)   │
│                      │  ◄───────────────────────────  │                           │
│  • Alt+Click capture │        live run events         │  • Fastify HTTP           │
│  • marks tray (#N)   │                                │  • Fastify WebSocket      │
│  • prompt composer   │                                │  • persistence            │
│  • run panel + diff  │                                │  • git sandbox orch.      │
└──────────────────────┘                                │  • agent launcher (execa) │
                                                         │  • MCP stdio server       │
                                            stdio MCP    └────────────┬──────────────┘
┌──────────────────────┐  ◄──────────────────────────────────────────┘
│   Coding agent       │   get_session / list_elements / get_element_by_id /
│ (Claude/Cursor/…)    │   get_latest_request
└──────────────────────┘
```

1. **Browser extension** (`apps/extension`) — captures marked elements. It talks **only** to
   `http://127.0.0.1:<port>` and never invokes agents or reads the repo directly.
2. **Daemon** (`@clicksmith/daemon`) — owns sessions, runs, and safety. One Node process exposing
   HTTP, WebSocket, and an MCP stdio server.
3. **MCP server** — exposes captured context (read-only) to any MCP-capable coding agent.
4. **Agent adapters** (`@clicksmith/agent-config` + daemon launcher) — spawn the selected tool from
   config, with no hardcoded CLI details.

## 2. Packages and boundaries

| Package | Runtime | Depends on | Responsibility |
| --- | --- | --- | --- |
| `@clicksmith/core` | platform-neutral | `zod` only | Schemas, types, IDs, session math, locator ranking, bundle validation. |
| `@clicksmith/agent-config` | Node | `core` | Instruction template + native renderers; `agents.config.json` schema + defaults. |
| `@clicksmith/daemon` | Node | `core`, `agent-config` | HTTP/WS/MCP, persistence, sandboxing, launching, enrichment. |
| `@clicksmith/unplugin` | build-time (Node) | — | Dev-only `data-loc` AST injection. |
| `create-clicksmith` | Node CLI | `core`, `agent-config` | Detection + wiring + file generation. |
| `apps/extension` | browser (MV3) | `core` (types) | UI + capture. |

**Rule:** `core` must not import Node or browser globals. Everything else may depend on `core`; the
extension imports only types from it.

## 3. Data contracts (`@clicksmith/core`)

### CaptureBundle (v5)

```ts
{
  v: 5,
  sessionId: string,
  submittedAt: string,           // ISO 8601
  prompt: string,
  app: { url, route, page },
  elements: CapturedElement[],
  execution: ExecutionOptions,
  enrichment?: Enrichment         // optional code-review-graph context
}
```

### CapturedElement

```ts
{
  id: number,                    // 1-based; surfaced to users as #N
  ts: string,                    // ISO 8601 capture time
  locator: Locator,
  el: { tag, text?, role?, label?, attrs, iconHints? },
  near: NearContext,             // surrounding labels/headings for disambiguation
  conditions: { viewport, theme?, mediaQueries? },
  screenshot?: string,           // small data-URL thumbnail
  frameworkHints?: Record<string, unknown>
}
```

### Locator (discriminated union, ranked `source → attr → behavioral → dom`)

```ts
| { kind: 'source';     file, line, column?, export? }   // best: exact file/line via data-loc
| { kind: 'attr';       attr, value, selector }          // stable test/id attribute
| { kind: 'behavioral'; role, name, nth? }               // ARIA role + accessible name
| { kind: 'dom';        selector, fingerprint }          // last resort: structural fingerprint
```

`rankLocators()` and `pickBestLocator()` enforce this order so agents always get the most precise
target available.

### ExecutionOptions (defaults)

```ts
{ mode: 'plan', isolation: 'worktree', autoApply: false }
```

`mode ∈ {plan, edit}`, `isolation ∈ {worktree, branch, inplace}`. Plan is the immutable default.

## 4. HTTP + WebSocket surface (daemon)

| Method & path | Purpose |
| --- | --- |
| `POST /capture` | Create or append to the active session for an app/route. |
| `POST /submit` | Finalize a `CaptureBundle` and start a run. |
| `POST /apply/:runId` | Merge/rebase a sandbox back into the working tree. |
| `GET /session/:id` | Read a session. |
| `DELETE /element/:sessionId/:elementId` | Remove a captured mark. |
| `GET /health` | Liveness + daemon metadata. |

WebSocket events (per session/run):
`capture-ack`, `element-removed`, `agent-started`, `agent-log`, `plan-ready`, `agent-done`,
`agent-error`, `apply-started`, `apply-done`, `apply-error`.

## 5. MCP tools (read-only)

`get_session`, `list_elements`, `get_element_by_id`, `get_latest_request`. Tool **descriptions**
teach the agent three things: how to resolve `#N` references, the locator priority order, and the
plan/worktree safety contract.

## 6. Agent adapter model

```ts
interface AgentAdapter {
  id: string;
  isAvailable(ctx): Promise<boolean>;
  buildCommand(ctx): CommandSpec;             // resolves placeholders
  parseEvents?(chunk, ctx): AgentEvent[];     // optional log → event mapping
}
```

Built-in adapters are **data**, loaded from `agents.config.json`. Launcher code only resolves
placeholders: `{bundlePath}`, `{prompt}`, `{instructionFile}`, `{mode}`, `{mcpServer}`, `{cwd}`.
Changing a vendor's CLI flag is always a config edit, never a code change.

## 7. Persistence

Sessions and runs are stored under the project's `.clicksmith/` directory when inside a repo,
otherwise under the OS cache directory. Unfinished sessions expire after a configurable default of
**24 hours**. Layout:

```
.clicksmith/
  sessions/<sessionId>.json
  runs/<runId>/
    bundle.json
    plan.md
    diff.patch
    agent.log
    run.json          # status, revert metadata, sandbox path
  screenshots/<elementId>.png
```

## 8. Execution safety model

1. Detect repo root + base commit.
2. Refuse non-`inplace` runs when the target branch has uncommitted changes.
3. Create a throwaway git worktree by default (`isolation: 'worktree'`).
4. Fall back to a dedicated branch only when worktrees are unavailable.
5. Record revert metadata for every run.
6. Plan-mode commands receive instructions + bundle path but **must not** mutate the main tree.
7. `POST /apply/:runId` merges/rebases sandbox changes back, reports conflicts, then cleans up.

## 9. Locator capture pipeline (extension)

On Alt+Click (AI Mode on), the content script tries, in order:

1. `data-loc` (injected by `@clicksmith/unplugin` in dev) → `source` locator.
2. Configured stable attributes (e.g. `data-testid`) → `attr` locator.
3. ARIA role + accessible name → `behavioral` locator.
4. DOM fingerprint → `dom` locator.

It also captures text, role, label, attrs, icon hints, near context, route/url, conditions, and a
small screenshot thumbnail.

## 10. Optional enrichment

When the `code-review-graph` MCP is configured, the daemon resolves source locators to attach
review context and impact radius per element. Failures are **non-blocking** and surfaced as
warnings on the bundle.

## 11. Privacy

No cloud services. All bundle data, screenshots, logs, MCP reads, and agent commands remain local.
