# @clicksmith/demo-vite

A small multi-route **Vite + React** app for exercising ClickSmith end to end:
capturing across routes, the dev-only `data-loc` injection, and the
plan → apply flow.

## Routes

| Route | Element | Role in the demo |
| --- | --- | --- |
| `#/` (Home) | `[data-testid="hero-cta"]` — bold primary button | The **reference** (`#2`). |
| `#/pricing` | `[data-testid="pricing-cta"]` — plain secondary button | The **target** (`#1`). |

The canonical acceptance scenario: capture the pricing CTA (`#1`) and the hero
CTA (`#2`) on different routes, then submit _"make #1 match #2's style"_.

## Run

```bash
pnpm dev        # Vite dev server — @clicksmith/unplugin injects data-loc here
pnpm build      # production build — data-loc injection is a hard no-op
```

In dev, inspect a button: you'll see a `data-loc="src/routes/...:line:col"`
attribute. That's what gives the agent an exact `source` locator. In the
production build, it's gone.

## Wiring

`vite.config.ts` puts `clicksmith()` first so it injects `data-loc` before the
React plugin compiles JSX:

```ts
import clicksmith from '@clicksmith/unplugin/vite';
export default defineConfig({ plugins: [clicksmith(), react()] });
```
