import { unpluginFactory } from './index.js';
import { createRollupPlugin } from 'unplugin';

/** ClickSmith data-loc injection as a Rollup plugin (dev-only). */
export default createRollupPlugin(unpluginFactory);
export type { ClickSmithUnpluginOptions } from './index.js';
