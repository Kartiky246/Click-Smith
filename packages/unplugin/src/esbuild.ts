import { unpluginFactory } from './index.js';
import { createEsbuildPlugin } from 'unplugin';

/** ClickSmith data-loc injection as an esbuild plugin (dev-only). */
export default createEsbuildPlugin(unpluginFactory);
export type { ClickSmithUnpluginOptions } from './index.js';
