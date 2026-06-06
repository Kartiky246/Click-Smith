import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import clicksmith from '@clicksmith/unplugin/vite';

// `clicksmith()` runs first (dev only) so it injects data-loc before the React
// plugin transforms JSX. It is a hard no-op during `vite build`.
export default defineConfig({
  plugins: [clicksmith(), react()],
});
