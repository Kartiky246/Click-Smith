# create-clicksmith

The one-command ClickSmith installer.

```bash
pnpm dlx create-clicksmith        # or: npm create clicksmith
```

It detects your stack and wires everything up **without clobbering your files**:

1. **Detects** your package manager, bundler, framework, and any stable
   attributes already in use (`data-testid`, `data-cy`, …).
2. **Recommends** the hybrid locator strategy `source → attr → behavioral → dom`.
3. **Wires** the dev-only `@clicksmith/unplugin` into your Vite config (when the
   stack supports it) so the agent gets exact `file:line` locators.
4. **Writes** agent instruction files for Claude (`CLAUDE.md`), Cursor
   (`.cursor/rules/clicksmith.mdc`), Codex (`AGENTS.md`), and a generic agent —
   using **managed blocks** so your existing content is preserved.
5. **Merges** `agents.config.json` (defaults + any project overrides) into
   `.clicksmith/`.
6. **Registers** the daemon's MCP server in `.mcp.json` (and `.cursor/mcp.json`),
   merging with any servers you already have.
7. **Gitignores** ClickSmith's runtime state (`.clicksmith/`).

## Flags

```bash
create-clicksmith [dir]
  --dry-run                 # print the plan, write nothing
  --no-unplugin             # skip the data-loc plugin wiring
  --agents claude,cursor    # which instruction files to render
```

## Programmatic API

The CLI is a thin wrapper around testable functions:

```ts
import { detectProject, planInstall, applyPlan } from 'create-clicksmith';

const info = await detectProject(process.cwd());
const plan = await planInstall(info, { useUnplugin: info.supportsUnplugin });
// inspect plan.changes (each has action: create | merge | skip) …
await applyPlan(process.cwd(), plan);
```

`planInstall` reads existing files and computes the *final merged contents* up
front, so it is fully deterministic and easy to test. `applyPlan` only writes.
