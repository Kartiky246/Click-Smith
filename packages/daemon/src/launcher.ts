import { execa } from 'execa';
import type { CommandSpec } from '@clicksmith/agent-config';

export interface LaunchHandlers {
  onLog: (stream: 'stdout' | 'stderr', chunk: string) => void;
  signal?: AbortSignal;
}

export interface LaunchResult {
  exitCode: number;
  stdout: string;
  canceled: boolean;
}

/**
 * Spawn a resolved {@link CommandSpec} with execa, streaming stdout/stderr to
 * the caller as they arrive. Never rejects on non-zero exit — the run manager
 * decides what a non-zero code means.
 */
export async function launchAgent(spec: CommandSpec, handlers: LaunchHandlers): Promise<LaunchResult> {
  const subprocess = execa(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    reject: false,
    all: false,
    cancelSignal: handlers.signal,
  });

  let stdout = '';
  subprocess.stdout?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    stdout += chunk;
    handlers.onLog('stdout', chunk);
  });
  subprocess.stderr?.on('data', (data: Buffer) => {
    handlers.onLog('stderr', data.toString());
  });

  const result = await subprocess;
  return {
    exitCode: result.exitCode ?? (result.isCanceled ? 130 : 0),
    stdout,
    canceled: Boolean(result.isCanceled),
  };
}
