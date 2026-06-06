import { unpluginFactory } from './index.js';
import { createRspackPlugin } from 'unplugin';

/** ClickSmith data-loc injection as an Rspack plugin (dev-only). */
export default createRspackPlugin(unpluginFactory);
export type { ClickSmithUnpluginOptions } from './index.js';
