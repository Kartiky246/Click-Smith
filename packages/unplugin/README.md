# @clicksmith/unplugin

Dev-only `data-loc` injection so ClickSmith can resolve a clicked element back to
its **exact source file and line** — the strongest locator in the
`source → attr → behavioral → dom` ranking.

Built on [unplugin](https://github.com/unjs/unplugin), so it works across Vite,
Rollup, Webpack, Rspack, and esbuild from one implementation.

> **Production is a hard no-op.** The plugin only injects when
> `NODE_ENV !== 'production'` (and, under Vite, only during `vite` dev — never
> `vite build`). Your shipped bundles never contain `data-loc`.

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import clicksmith from '@clicksmith/unplugin/vite';

export default defineConfig({
  plugins: [clicksmith(), react()],
});
```

Other bundlers:

```ts
import clicksmith from '@clicksmith/unplugin/webpack'; // or /rollup, /rspack, /esbuild
```

## What it does

For each JSX/TSX opening element it injects `data-loc="relative/path:line:column"`:

```jsx
// before
<button onClick={onClick}>Buy</button>
// after (dev only)
<button data-loc="src/Card.tsx:4:6" onClick={onClick}>Buy</button>
```

- **Idempotent** — never adds a duplicate `data-loc`.
- **Sourceless fallback** — files that can't be parsed are left untouched; the
  runtime locator pipeline (attr → behavioral → dom) still works without it.
- **Source maps** preserved.

## Options

```ts
clicksmith({
  root: process.cwd(),       // base for the relative paths
  attribute: 'data-loc',     // attribute name
  include: /\.[jt]sx$/,      // which files to transform
  exclude: /node_modules/,
  enabled: undefined,        // default: NODE_ENV !== 'production'
});
```

## Framework support

First-class support targets **JSX/TSX** (React and friends). Vue, Svelte, and
Angular rely on compiler-specific hooks; where those aren't wired up the build is
a no-op and ClickSmith automatically falls back to attribute/behavioral/DOM
locators — capture still works, you just don't get exact `file:line`.
