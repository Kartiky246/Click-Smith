import { unpluginFactory } from './index.js';
import { createVitePlugin } from 'unplugin';

/** ClickSmith data-loc injection as a Vite plugin (dev-only). */
export default createVitePlugin(unpluginFactory);
export type { ClickSmithUnpluginOptions } from './index.js';
