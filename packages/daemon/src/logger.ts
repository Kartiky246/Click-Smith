/* Minimal leveled logger. Writes to stderr so it never corrupts MCP stdio. */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

export interface Logger {
  debug(msg: string, ...rest: unknown[]): void;
  info(msg: string, ...rest: unknown[]): void;
  warn(msg: string, ...rest: unknown[]): void;
  error(msg: string, ...rest: unknown[]): void;
}

export function createLogger(level: LogLevel = 'info', prefix = 'clicksmith'): Logger {
  const min = ORDER[level];
  const emit = (lvl: LogLevel, msg: string, rest: unknown[]) => {
    if (ORDER[lvl] < min) return;
    const line = `[${prefix}] ${lvl.toUpperCase()} ${msg}`;
    // Always stderr — stdout is reserved for MCP's JSON-RPC transport.
    process.stderr.write(rest.length ? `${line} ${rest.map(fmt).join(' ')}\n` : `${line}\n`);
  };
  return {
    debug: (m, ...r) => emit('debug', m, r),
    info: (m, ...r) => emit('info', m, r),
    warn: (m, ...r) => emit('warn', m, r),
    error: (m, ...r) => emit('error', m, r),
  };
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack ?? v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
