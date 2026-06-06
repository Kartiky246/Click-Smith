import { createUnplugin, type UnpluginFactory } from 'unplugin';
import { relative, isAbsolute } from 'node:path';
import { injectDataLoc } from './transform.js';

export interface ClickSmithUnpluginOptions {
  /** Base directory for the relative paths encoded into `data-loc`. Default `process.cwd()`. */
  root?: string;
  /** Attribute name to inject. Default `data-loc`. */
  attribute?: string;
  /** Which files to transform. Default `/\.[jt]sx$/`. */
  include?: RegExp;
  /** Files to skip. Default `/node_modules/`. */
  exclude?: RegExp;
  /**
   * Master switch. When `false`, the plugin is a complete no-op. Defaults to
   * `process.env.NODE_ENV !== 'production'` — production builds never inject.
   */
  enabled?: boolean;
}

export const unpluginFactory: UnpluginFactory<ClickSmithUnpluginOptions | undefined> = (
  rawOptions = {},
) => {
  const root = rawOptions.root ?? process.cwd();
  const attribute = rawOptions.attribute ?? 'data-loc';
  const include = rawOptions.include ?? /\.[jt]sx$/;
  const exclude = rawOptions.exclude ?? /node_modules/;
  const enabled = rawOptions.enabled ?? process.env.NODE_ENV !== 'production';

  return {
    name: '@clicksmith/unplugin',
    enforce: 'pre',

    transformInclude(id) {
      if (!enabled) return false;
      const clean = id.split('?')[0]!;
      return include.test(clean) && !exclude.test(clean);
    },

    transform(code, id) {
      if (!enabled) return null;
      const clean = id.split('?')[0]!;
      const file = isAbsolute(clean) ? relative(root, clean) : clean;
      const result = injectDataLoc(code, { file, attribute });
      if (!result) return null;
      return { code: result.code, map: result.map };
    },

    // Vite: hard no-op for `vite build` — only run in the dev server.
    vite: {
      apply: 'serve',
    },
  };
};

/** The framework-agnostic unplugin instance. */
export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
export { injectDataLoc } from './transform.js';
export type { InjectOptions, InjectResult } from './transform.js';
