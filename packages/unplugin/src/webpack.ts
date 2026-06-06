import { unpluginFactory } from './index.js';
import { createWebpackPlugin } from 'unplugin';

/** ClickSmith data-loc injection as a Webpack plugin (dev-only). */
export default createWebpackPlugin(unpluginFactory);
export type { ClickSmithUnpluginOptions } from './index.js';
