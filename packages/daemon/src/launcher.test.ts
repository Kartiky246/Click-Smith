import { describe, expect, it } from 'vitest';
import { launchAgent } from './launcher.js';

describe('launchAgent', () => {
  it('closes stdin so non-interactive agents do not wait for piped input', async () => {
    const result = await launchAgent(
      {
        command: 'node',
        args: [
          '-e',
          [
            'let ended = false;',
            'process.stdin.resume();',
            "process.stdin.on('end', () => { ended = true; console.log('stdin-ended'); });",
            'setTimeout(() => process.exit(ended ? 0 : 9), 50);',
          ].join(''),
        ],
      },
      { onLog: () => {} },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('stdin-ended');
  });
});
