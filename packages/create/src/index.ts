/**
 * create-clicksmith
 *
 * Project detection + installation logic for ClickSmith. The CLI (`src/cli.ts`)
 * is a thin wrapper around these pure-ish, testable functions.
 */

export { detectProject } from './detect.js';
export type { ProjectInfo, PackageManager, Bundler, Framework } from './detect.js';
export { planInstall, applyPlan } from './install.js';
export type { InstallPlan, InstallOptions, FileChange } from './install.js';
