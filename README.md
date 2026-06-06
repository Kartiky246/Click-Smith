<div align="center">

# ⚒️ ClickSmith

**Click an element in your browser. Describe the change. Let your coding agent ship it — safely, in a throwaway git worktree.**

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-f69220.svg)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)

</div>

---

ClickSmith turns "this button on the pricing page should look like the one in the hero" into a precise, agent-ready request. You **Alt+Click** the elements you mean, ClickSmith captures a stable, source-aware locator for each one, and a local daemon hands the bundle to whatever coding agent you already use (Claude Code, Cursor, Codex, …) — **in a sandboxed git worktree, so your working tree is never touched until you explicitly click _Apply_.**

> **Local-first & private.** No cloud services. Every bundle, screenshot, log, MCP read, and agent command stays on your machine.

## Why ClickSmith?

Coding agents are great at editing code but blind to the running UI. Describing _which_ element you mean ("the third card, no, the CTA inside it") is lossy and slow. ClickSmith closes that gap:

- 🎯 **Point, don't describe.** Alt+Click one or many elements across routes. They show up as `#1`, `#2`, … in a marks tray.
- 🧭 **Stable locators, ranked.** `source → attr → behavioral → dom`. When a dev build injects `data-loc`, the agent gets an exact file/line; otherwise it falls back gracefully.
- 🔌 **Bring your own agent.** Adapters are **config-driven** (`agents.config.json`) — changing a CLI flag is an edit, not a code change.
- 🛡️ **Safe by default.** `plan + worktree` mode is the immutable default. Apply, in-place edits, and auto-apply always require explicit confirmation.
- 🧠 **MCP-native context.** Any MCP-capable agent can read the captured session with `get_session`, `list_elements`, `get_element_by_id`, `get_latest_request`.

## The default journey

```
Alt+Click elements  ─►  review #1, #2 in the marks tray  ─►  type a prompt
        │                                                        │
        ▼                                                        ▼
  capture bundle (v5)                              submit in `plan + worktree`
        │                                                        │
        ▼                                                        ▼
  daemon stores session  ──────────►  agent runs in a git worktree (stream logs)
                                                                 │
                                                                 ▼
                                            inspect plan / diff  ─►  click **Apply**
                                                                 │
                                                                 ▼
                                          changes merged back; sandbox cleaned up
```

## Quick start

```bash
# In your existing web project:
pnpm dlx create-clicksmith
```

The installer detects your bundler/framework/package manager, wires up stable-locator support (the unplugin for Vite/React, or your existing stable attributes), writes agent instruction files, merges `agents.config.json`, and registers the daemon's MCP server. Then:

```bash
pnpm clicksmith daemon        # start the localhost daemon (HTTP + WS + MCP)
```

Load the **ClickSmith** browser extension (Chrome/Firefox), toggle **AI Mode**, and Alt+Click away.

## Monorepo layout

| Package | What it does |
| --- | --- |
| [`@clicksmith/core`](./packages/core) | Shared zod schemas, types, ID/session helpers, locator ranking, bundle validation. No runtime assumptions beyond `zod`. |
| [`@clicksmith/daemon`](./packages/daemon) | The localhost brain: Fastify HTTP + WebSocket, MCP stdio server, persistence, git sandbox orchestration, agent launching. |
| [`@clicksmith/agent-config`](./packages/agent-config) | One shared instruction template → native files for Claude, Cursor, Codex, Antigravity, generic agents. |
| [`@clicksmith/unplugin`](./packages/unplugin) | Dev-only `data-loc` injection across Vite/Rollup/Webpack/esbuild/Rspack. Hard no-op in production. |
| [`create-clicksmith`](./packages/create) | The project installer / wizard. |
| [`apps/extension`](./apps/extension) | WXT MV3 browser extension (Chrome/Firefox). Talks only to `127.0.0.1`. |
| [`apps/demo-vite`](./apps/demo-vite) | A multi-route Vite + React demo for E2E and manual testing. |

## Development

```bash
pnpm install        # install workspace deps
pnpm build          # build all packages (turbo)
pnpm test           # run vitest across the workspace
pnpm typecheck      # strict TS project-wide
pnpm lint           # eslint
pnpm format         # prettier --write
```

Requirements: **Node ≥ 20.11**, **pnpm ≥ 9**, **git ≥ 2.20** (for worktree support).

## How it stays safe

ClickSmith never lets an agent mutate your main working tree implicitly:

1. The daemon detects the repo root and base commit.
2. Non-`inplace` runs are **refused** when the target branch has uncommitted changes.
3. By default it creates a throwaway **git worktree**; if worktrees are unavailable it falls back to a dedicated branch.
4. Plan-mode agents receive instructions + the bundle path but **cannot** touch the main tree; the daemon captures the generated plan/diff.
5. `POST /apply/:runId` merges/rebases the sandbox back, reports conflicts, then cleans up successful sandboxes.
6. Revert metadata is recorded for every run.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Contributing

This is a TypeScript monorepo using pnpm workspaces + Turborepo. Each package ships with its own `README.md`. Run `pnpm build && pnpm test && pnpm typecheck` before opening a PR.

## License

[MIT](./LICENSE) © ClickSmith contributors
