import { describe, expect, it } from 'vitest';
import { unpluginFactory } from './index.js';

function makePlugin(opts?: Parameters<typeof unpluginFactory>[0]) {
  // unplugin factories are called with (options, meta).
  return unpluginFactory(opts, { framework: 'rollup' } as never) as {
    transformInclude: (id: string) => boolean;
    transform: (code: string, id: string) => { code: string } | null;
  };
}

describe('unplugin factory', () => {
  it('includes .jsx/.tsx and excludes node_modules when enabled', () => {
    const p = makePlugin({ enabled: true });
    expect(p.transformInclude('/app/src/App.tsx')).toBe(true);
    expect(p.transformInclude('/app/src/App.jsx')).toBe(true);
    expect(p.transformInclude('/app/src/App.ts')).toBe(false);
    expect(p.transformInclude('/app/node_modules/x/y.tsx')).toBe(false);
    // query suffixes are stripped before matching
    expect(p.transformInclude('/app/src/App.tsx?used')).toBe(true);
  });

  it('is a hard no-op when disabled (production)', () => {
    const p = makePlugin({ enabled: false });
    expect(p.transformInclude('/app/src/App.tsx')).toBe(false);
    expect(p.transform('<div>x</div>', '/app/src/App.tsx')).toBeNull();
  });

  it('encodes a project-relative path from root', () => {
    const p = makePlugin({ enabled: true, root: '/app' });
    const out = p.transform('<div>x</div>\n', '/app/src/App.tsx');
    expect(out?.code).toMatch(/data-loc="src\/App\.tsx:1:0"/);
  });
});
