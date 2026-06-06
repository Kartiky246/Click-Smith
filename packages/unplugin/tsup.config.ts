import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/vite.ts', 'src/rollup.ts', 'src/webpack.ts', 'src/rspack.ts', 'src/esbuild.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
});
