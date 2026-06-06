#!/usr/bin/env node
import { detectProject } from './detect.js';
import { applyPlan, planInstall } from './install.js';

const HELP = `create-clicksmith

Usage:
  create-clicksmith [dir] [--dry-run] [--no-unplugin] [--agents claude,cursor,codex,generic]

Detects your stack, wires stable locators, writes agent instruction files,
merges agents.config.json, and registers the ClickSmith MCP server. Existing
files are preserved (managed blocks / JSON merges).
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const positional = args.find((a) => !a.startsWith('--'));
  const root = positional ? resolveDir(positional) : process.cwd();
  const dryRun = args.includes('--dry-run');
  const useUnplugin = !args.includes('--no-unplugin');
  const agentsArg = valueOf(args, '--agents');
  const agents = agentsArg ? (agentsArg.split(',') as never) : undefined;

  log(`⚒️  ClickSmith installer\n`);
  const info = await detectProject(root);
  log(`Detected:`);
  log(`  package manager : ${info.packageManager}`);
  log(`  bundler         : ${info.bundler}`);
  log(`  framework       : ${info.framework}`);
  log(`  stable attrs    : ${info.stableAttrs.join(', ') || '(none found)'}`);
  log(`  unplugin        : ${info.supportsUnplugin ? 'supported' : 'not available for this stack'}`);
  log('');

  const plan = await planInstall(info, {
    ...(agents ? { agents } : {}),
    useUnplugin: useUnplugin && info.supportsUnplugin,
  });

  log(`Planned changes:`);
  for (const change of plan.changes) {
    const mark = change.action === 'create' ? '+' : change.action === 'merge' ? '~' : '·';
    log(`  ${mark} ${change.path}${change.action === 'skip' ? ` (${change.reason ?? 'unchanged'})` : ''}`);
  }
  log('');

  if (dryRun) {
    log('--dry-run: no files written.');
  } else {
    const written = await applyPlan(root, plan);
    log(`Wrote ${written.length} file(s).`);
  }

  for (const message of plan.messages) log(`ℹ️  ${message}`);
  log('\nNext steps:');
  for (const step of plan.nextSteps) log(`  ${step}`);
}

function resolveDir(dir: string): string {
  return dir.startsWith('/') ? dir : `${process.cwd()}/${dir}`;
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1]!.startsWith('--') ? args[i + 1] : undefined;
}

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

main().catch((err) => {
  process.stderr.write(`create-clicksmith failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
