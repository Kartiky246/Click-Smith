#!/usr/bin/env node
import { resolveDaemonConfig } from './config.js';
import { DaemonService } from './daemon-service.js';
import { buildServer } from './server.js';
import { startMcp } from './mcp.js';
import { version } from './version.js';
import { defaultBinExists } from '@clicksmith/agent-config';

const HELP = `clicksmith ${version}

Usage:
  clicksmith daemon [--port <n>] [--host <h>] [--log <level>]
  clicksmith mcp                     Run the read-only MCP stdio server
  clicksmith doctor                  Check daemon config and agent CLIs
  clicksmith version
  clicksmith help

The daemon binds loopback only and stores state under .clicksmith/ (in a repo)
or your OS cache directory otherwise.
`;

async function runDaemon(args: string[]): Promise<void> {
  const opts = parseFlags(args);
  const config = await resolveDaemonConfig({
    ...(opts.port ? { port: Number(opts.port) } : {}),
    ...(opts.host ? { host: opts.host } : {}),
    ...(opts.log ? { logLevel: opts.log as never } : {}),
  });
  const service = new DaemonService({ config });
  await service.init();
  const app = await buildServer(service);

  await app.listen({ host: config.host, port: config.port });
  config.logger.info(`daemon listening on http://${config.host}:${config.port}`);
  config.logger.debug(`storage: ${config.storageRoot}`);
  config.logger.debug(`repo: ${config.repoRoot ?? '(none — using OS cache)'}`);
  config.logger.debug(`agents: ${config.agents.agents.map((a) => a.id).join(', ')}`);

  const shutdown = async () => {
    config.logger.info('shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function runDoctor(args: string[]): Promise<void> {
  const opts = parseFlags(args);
  const config = await resolveDaemonConfig({
    ...(opts.port ? { port: Number(opts.port) } : {}),
    ...(opts.host ? { host: opts.host } : {}),
    logLevel: 'silent',
  });

  const lines: string[] = [];
  lines.push(`clicksmith ${version} doctor`);
  lines.push(`daemon URL : http://${config.host}:${config.port}`);
  lines.push(`cwd        : ${config.cwd}`);
  lines.push(`repo       : ${config.repoRoot ?? '(none)'}`);
  lines.push(`storage    : ${config.storageRoot}`);
  lines.push(`PATH       : ${process.env.PATH ?? '(empty)'}`);
  lines.push('');
  lines.push('Agents:');

  for (const agent of config.agents.agents) {
    const bins = agent.detect?.anyOf ?? [agent.command];
    const checks = await Promise.all(
      bins.map(async (bin) => ({ bin, ok: await defaultBinExists(bin) })),
    );
    const ok = checks.some((check) => check.ok);
    lines.push(`  ${ok ? '✓' : '✗'} ${agent.id} (${agent.label ?? agent.command})`);
    lines.push(`      command: ${agent.command}`);
    lines.push(
      `      checked: ${checks.map((check) => `${check.bin}${check.ok ? ' ✓' : ' ✗'}`).join(', ')}`,
    );
    if (!ok) {
      lines.push(
        '      fix: install the CLI on PATH, or edit .clicksmith/agents.config.json with an absolute command/detect path.',
      );
    }
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'daemon':
      return runDaemon(rest);
    case 'mcp':
      return startMcp();
    case 'doctor':
      return runDoctor(rest);
    case 'version':
    case '--version':
    case '-v':
      process.stdout.write(`${version}\n`);
      return;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP);
      return;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`clicksmith failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
