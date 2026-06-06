import { access, constants } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

/**
 * Default executable-on-PATH check. Scans `PATH` for the given binary,
 * honoring `PATHEXT` on Windows. Adapters receive this via the launch context
 * but the daemon may override it (e.g. for tests).
 */
export async function defaultBinExists(bin: string): Promise<boolean> {
  // An explicit path: just check it directly.
  if (bin.includes('/') || bin.includes('\\')) {
    return canExecute(bin);
  }
  const pathEnv = process.env.PATH ?? '';
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      if (await canExecute(join(dir, bin + ext))) return true;
    }
  }
  return false;
}

async function canExecute(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
