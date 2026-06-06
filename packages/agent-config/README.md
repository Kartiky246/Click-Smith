# @clicksmith/agent-config

The config-driven brain for launching coding agents and teaching them the
ClickSmith conventions. Two responsibilities:

1. **Adapters as data.** A built-in adapter is just an entry in
   `agents.config.json`. The launcher only resolves `{placeholders}` — it has no
   hardcoded knowledge of any vendor CLI.
2. **One instruction template, many native files.** The shared body is authored
   once and rendered into each agent's idiomatic location.

## Adapters are data, not code

```jsonc
// agents.config.json
{
  "version": 1,
  "defaultAgent": "claude",
  "agents": [
    {
      "id": "claude",
      "label": "Claude Code",
      "command": "claude",
      "args": ["-p", "{prompt}", "--append-system-prompt", "@{instructionFile}"],
      "detect": { "anyOf": ["claude"] },
      "instructions": { "target": "claude", "file": "CLAUDE.md" },
      "mcp": { "register": "claude" }
    }
  ]
}
```

> ⚠️ The shipped templates (`DEFAULT_AGENTS`) are **examples**. Changing a CLI
> flag is always an `agents.config.json` edit — never a code change.

### Placeholders

The launcher resolves exactly these tokens, and nothing else:

| Placeholder | Meaning |
| --- | --- |
| `{bundlePath}` | Absolute path to the serialized capture bundle. |
| `{prompt}` | The user's free-text prompt. |
| `{instructionFile}` | Rendered instruction file for this agent. |
| `{mode}` | `plan` or `edit`. |
| `{mcpServer}` | Reference to reach the ClickSmith MCP server. |
| `{cwd}` | Sandbox working directory. |

```ts
import { configToAdapter, DEFAULT_AGENTS } from '@clicksmith/agent-config';

const adapter = configToAdapter(DEFAULT_AGENTS[0]);
await adapter.isAvailable(ctx);     // PATH probe of detect.anyOf
adapter.buildCommand(ctx);          // → { command, args, env, cwd }
```

## Config layering

```ts
import { mergeAgentsConfig, DEFAULT_AGENTS_CONFIG } from '@clicksmith/agent-config';

const effective = mergeAgentsConfig(DEFAULT_AGENTS_CONFIG, projectConfig, userConfig);
```

Defaults → project → user. Same `id` replaces; new ids append; the last
`defaultAgent` wins.

## Instruction rendering

```ts
import { renderInstructions, applyManagedBlock } from '@clicksmith/agent-config';

const rule = renderInstructions('claude', { daemonPort: 8722 });
// rule.path === 'CLAUDE.md', rule.shared === true → merge as a managed block:
const next = applyManagedBlock(existingClaudeMd, rule.content);
```

Targets: `claude` (`CLAUDE.md`), `codex` (`AGENTS.md`), `cursor`
(`.cursor/rules/clicksmith.mdc`), `antigravity`
(`.antigravity/rules/clicksmith.md`), `generic`
(`.clicksmith/AGENT_INSTRUCTIONS.md`). Shared files use a managed block so your
existing content is preserved; dedicated files are written whole.

Every rendered file teaches the same three things: the `#N` reference system,
the `source → attr → behavioral → dom` locator priority, and the plan/worktree
safety contract.
