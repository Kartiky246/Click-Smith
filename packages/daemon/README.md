# @clicksmith/daemon

The localhost brain of ClickSmith. A single Node process that owns sessions,
runs, and **safety**. It exposes:

- **HTTP** (Fastify) — capture, submit, apply, session reads.
- **WebSocket** (Fastify) — live run events streamed to the extension.
- **MCP** (stdio) — read-only tools for any MCP-capable coding agent.
- **Git sandbox orchestration** — throwaway worktrees, dirty-tree refusal, apply.
- **Config-driven agent launching** — spawns the selected agent via `execa`.

Everything stays local. No cloud, no telemetry.

## Run it

```bash
clicksmith daemon --port 8722        # HTTP + WS + state under .clicksmith/
clicksmith mcp                       # read-only MCP stdio server
clicksmith version
```

## HTTP surface

| Method & path                           | Purpose                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| `GET /health`                           | Liveness + daemon metadata.                                    |
| `POST /capture`                         | Create/append the active session for an app/route.             |
| `POST /submit`                          | Finalize a bundle and start a run. `409` if the tree is dirty. |
| `POST /apply/:runId`                    | Merge the sandbox back; reports conflicts.                     |
| `GET /session/:id`                      | Read a session.                                                |
| `DELETE /element/:sessionId/:elementId` | Remove a captured mark.                                        |

WebSocket (`/ws`) streams: `capture-ack`, `element-removed`, `agent-started`,
`agent-log`, `plan-ready`, `agent-done`, `agent-error`, `apply-started`,
`apply-done`, `apply-error`. Send `{ "type": "subscribe", "runId": "..." }`
or `{ "type": "subscribe", "sessionId": "..." }` to replay buffered events on
reconnect without flooding the client with unrelated historical logs.

## Safety model

`POST /submit` with the default `plan + worktree` options:

1. Detects the repo root and base commit.
2. **Refuses** (`409`) if the working tree has uncommitted changes (ignoring
   `.clicksmith/` itself) — unless you explicitly choose `inplace`.
3. Creates a throwaway worktree at `.clicksmith/worktrees/<runId>` on branch
   `clicksmith/<runId>`. Falls back to a dedicated branch if worktrees are
   unavailable.
4. Launches the agent **in the sandbox** — your main tree is never touched.
5. Captures the agent's stdout as `plan.md` and a binary-safe `diff.patch`.
6. `POST /apply/:runId` 3-way-applies the patch onto the main tree, commits,
   records revert metadata, and cleans up the worktree. Conflicts are reported,
   not forced.

## Persistence layout

```
.clicksmith/                 (or OS cache dir when not in a repo)
  sessions/<id>.json
  runs/<runId>/
    bundle.json  plan.md  diff.patch  agent.log  run.json
  worktrees/<runId>/         (throwaway git worktree)
  agents.config.json         (optional project agent overrides)
```

Unsubmitted sessions expire after a configurable default of 24 hours.

## Programmatic use

```ts
import { DaemonService, buildServer, resolveDaemonConfig } from '@clicksmith/daemon';

const config = await resolveDaemonConfig({ port: 8722 });
const service = new DaemonService({ config });
await service.init();
const app = await buildServer(service);
await app.listen({ host: config.host, port: config.port });
```

The `DaemonService` is framework-agnostic and fully unit-/integration-tested,
including the end-to-end acceptance flow (capture → plan in worktree → prove the
main tree is untouched → apply → cleanup).
