import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  configToAdapter,
  defaultBinExists,
  renderInstructionBody,
  resolveAgent,
  type AgentAdapter,
  type AgentConfig,
  type AgentLaunchContext,
} from '@clicksmith/agent-config';
import {
  newRunId,
  type ApplyResponse,
  type CaptureBundle,
  type CapturedElement,
  type SandboxInfo,
} from '@clicksmith/core';
import { describeSandbox, Git } from './git.js';
import { launchAgent } from './launcher.js';
import { enrichBundle, type EnrichmentProvider } from './enrichment.js';
import type { EventBus } from './events.js';
import type { FileStore } from './store.js';
import type { Logger } from './logger.js';
import type { DaemonConfig } from './config.js';
import type { RunRecord } from './types.js';

/** Raised when a non-inplace run is requested against a dirty working tree. */
export class RefusalError extends Error {
  readonly code = 'DIRTY_TREE';
}

export interface RunManagerDeps {
  store: FileStore;
  config: DaemonConfig;
  bus: EventBus;
  logger: Logger;
  enrichment?: EnrichmentProvider;
  /** Override PATH probing (tests inject a fake). */
  binExists?: (bin: string) => Promise<boolean>;
}

const COMMIT_PREFIX = 'ClickSmith';
const POSITIVE_AVAILABILITY_CACHE_MS = 60_000;
const NEGATIVE_AVAILABILITY_CACHE_MS = 5_000;
const LOG_FLUSH_MS = 75;
const LOG_FLUSH_BYTES = 16 * 1024;

interface AvailabilityCacheEntry {
  ok: boolean;
  expiresAt: number;
}

export class RunManager {
  private readonly availabilityCache = new Map<string, AvailabilityCacheEntry>();
  private _instructionFile: string | null = null;

  constructor(private readonly deps: RunManagerDeps) {}

  /**
   * Prepare a sandbox and start an agent run. The sandbox is prepared
   * synchronously so a dirty-tree refusal surfaces as an error to the caller;
   * the agent itself runs in the background, emitting WebSocket events.
   */
  async createRun(input: CaptureBundle): Promise<{ run: RunRecord }> {
    const { store, config, bus, logger } = this.deps;
    const agentConfig = resolveAgent(config.agents, input.execution.agentId);
    if (!agentConfig) {
      throw new RefusalError(
        `No agent configured (requested: ${input.execution.agentId ?? 'default'}).`,
      );
    }

    const runId = newRunId();
    const now = new Date();
    const repoRoot = config.repoRoot;
    const isolation = repoRoot ? input.execution.isolation : 'inplace';

    let sandbox: SandboxInfo | null = null;
    let baseCommit: string | null = null;
    let baseBranch: string | null = null;

    if (repoRoot) {
      const git = new Git(repoRoot);
      [baseCommit, baseBranch] = await Promise.all([
        git.headCommit(),
        safe(() => git.currentBranch()),
      ]);
      const baseRef = input.execution.baseRef ?? baseCommit;

      if (
        isolation !== 'inplace' &&
        (await git.isDirty({ exclude: ['.clicksmith/', '.clicksmith'] }))
      ) {
        throw new RefusalError(
          `Refusing to run in ${isolation} isolation: the working tree has uncommitted changes. ` +
            `Commit or stash them, or use inplace isolation explicitly.`,
        );
      }
      sandbox = await this.prepareSandbox(
        git,
        runId,
        isolation,
        baseRef,
        repoRoot,
        baseCommit,
        logger,
      );
    }

    const enriched = await Promise.race([
      enrichBundle(input, this.deps.enrichment),
      new Promise<CaptureBundle>((resolve) => setTimeout(() => resolve(input), 300)),
    ]);
    await store.saveBundle(runId, enriched);

    const run: RunRecord = {
      runId,
      sessionId: enriched.sessionId,
      agentId: agentConfig.id,
      status: 'running',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      mode: enriched.execution.mode,
      isolation,
      prompt: enriched.prompt,
      repoRoot,
      baseCommit,
      baseBranch,
      sandbox,
      revert: null,
    };
    await store.saveRun(run);

    bus.emit({
      type: 'agent-started',
      runId,
      sessionId: run.sessionId,
      agentId: run.agentId,
      sandbox,
    });

    // Fire-and-forget the actual agent execution.
    void this.execute(run, enriched, agentConfig).catch((err) => {
      logger.error(`run ${runId} crashed`, err);
    });

    return { run };
  }

  private async prepareSandbox(
    git: Git,
    runId: string,
    isolation: SandboxInfo['isolation'],
    baseRef: string,
    repoRoot: string,
    baseCommit: string,
    logger: Logger,
  ): Promise<SandboxInfo> {
    const branch = `clicksmith/${runId}`;
    if (isolation === 'inplace') {
      return describeSandbox('inplace', repoRoot, null, baseCommit);
    }
    if (isolation === 'worktree') {
      if (await git.supportsWorktree()) {
        const path = this.deps.store.paths.sandboxDir(runId);
        await mkdir(join(path, '..'), { recursive: true });
        await git.createWorktree(path, branch, baseRef);
        return describeSandbox('worktree', path, branch, baseCommit);
      }
      logger.warn('git worktrees unavailable; falling back to a dedicated branch');
    }
    // branch isolation (explicit or worktree fallback)
    await git.createBranch(branch, baseRef);
    return describeSandbox('branch', repoRoot, branch, baseCommit);
  }

  private async execute(
    run: RunRecord,
    bundle: CaptureBundle,
    agentConfig: AgentConfig,
  ): Promise<void> {
    const { store, config, bus, logger } = this.deps;
    const sandboxPath = run.sandbox?.path ?? config.cwd;

    const instructionFile = await this.resolveInstructionFile(run);
    const agentPrompt = buildAgentPrompt({
      bundle,
      bundlePath: store.bundlePath(run.runId),
      run,
    });
    const ctx: AgentLaunchContext = {
      bundlePath: store.bundlePath(run.runId),
      prompt: bundle.prompt,
      agentPrompt,
      instructionFile,
      mode: bundle.execution.mode,
      mcpServer: 'clicksmith',
      cwd: sandboxPath,
      isolation: run.isolation,
      agentId: agentConfig.id,
      binExists: this.deps.binExists ?? defaultBinExists,
    };

    const adapter = configToAdapter(agentConfig);
    if (!(await this.isAgentAvailable(agentConfig, adapter, ctx))) {
      await this.fail(run, unavailableMessage(agentConfig));
      return;
    }

    const rawSpec = adapter.buildCommand(ctx);
    const spec = {
      ...rawSpec,
      env: {
        CLICKSMITH_BUNDLE_PATH: ctx.bundlePath,
        CLICKSMITH_INSTRUCTION_FILE: ctx.instructionFile,
        CLICKSMITH_MODE: ctx.mode,
        CLICKSMITH_ISOLATION: ctx.isolation,
        CLICKSMITH_RUN_ID: run.runId,
        ...(rawSpec.env ?? {}),
      },
    };
    logger.debug(`run ${run.runId}: ${spec.command} ${spec.args.slice(0, 2).join(' ')}`);

    const logBuffer = createLogBuffer(
      (chunk) => store.appendLog(run.runId, chunk),
      (err) => logger.warn(`run ${run.runId}: failed to persist agent log`, err),
    );

    let result;
    try {
      result = await launchAgent(spec, {
        onLog: (stream, chunk) => {
          logBuffer.append(chunk);
          bus.emit({ type: 'agent-log', runId: run.runId, stream, chunk });
        },
      });
    } catch (err) {
      await logBuffer.flush();
      await this.fail(run, err instanceof Error ? err.message : String(err));
      return;
    }
    await logBuffer.flush();

    // Capture artifacts from isolated sandboxes. Inplace runs edit the current
    // tree directly, so the extension does not need a daemon-generated patch.
    const plan = result.stdout.trim();
    let diff = '';
    if (run.sandbox && run.repoRoot && run.sandbox.isolation !== 'inplace') {
      diff = await Git.captureDiff(run.sandbox.path);
    }
    if (plan) await store.writeArtifact(run.runId, 'plan.md', plan);
    if (diff) await store.writeArtifact(run.runId, 'diff.patch', diff);

    run.exitCode = result.exitCode;
    run.hasPlan = plan.length > 0;
    run.hasDiff = diff.length > 0;

    if (result.exitCode !== 0) {
      await this.fail(run, `Agent exited with code ${result.exitCode}.`);
      return;
    }

    run.status = 'plan-ready';
    run.updatedAt = new Date().toISOString();
    await store.saveRun(run);
    bus.emit({
      type: 'plan-ready',
      runId: run.runId,
      ...(plan ? { plan } : {}),
      ...(diff ? { diff } : {}),
    });
    bus.emit({ type: 'agent-done', runId: run.runId, exitCode: result.exitCode });

    if (bundle.execution.autoApply) {
      logger.debug(`run ${run.runId}: autoApply`);
      await this.apply(run.runId);
    }
  }

  private async fail(run: RunRecord, message: string): Promise<void> {
    run.status = 'error';
    run.error = message;
    run.updatedAt = new Date().toISOString();
    await this.deps.store.saveRun(run);
    this.deps.bus.emit({ type: 'agent-error', runId: run.runId, message });
  }

  private async isAgentAvailable(
    agentConfig: AgentConfig,
    adapter: AgentAdapter,
    ctx: AgentLaunchContext,
  ): Promise<boolean> {
    const key = availabilityCacheKey(agentConfig);
    const now = Date.now();
    const cached = this.availabilityCache.get(key);
    if (cached && cached.expiresAt > now) return cached.ok;

    const ok = await adapter.isAvailable(ctx);
    this.availabilityCache.set(key, {
      ok,
      expiresAt: now + (ok ? POSITIVE_AVAILABILITY_CACHE_MS : NEGATIVE_AVAILABILITY_CACHE_MS),
    });
    return ok;
  }

  /**
   * Merge a finished run's sandbox changes back into the working tree. Reports
   * conflicts, commits on success, records revert metadata, and cleans up the
   * sandbox.
   */
  async apply(runId: string): Promise<ApplyResponse> {
    const { store, bus, logger } = this.deps;
    const run = await store.getRun(runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    if (!run.repoRoot || !run.sandbox) {
      throw new Error(`Run ${runId} has no git sandbox to apply.`);
    }

    bus.emit({ type: 'apply-started', runId });
    const git = new Git(run.repoRoot);
    const previousHead = await git.headCommit();
    const message = `${COMMIT_PREFIX} run ${runId}: ${truncate(run.prompt, 72)}`;

    try {
      let commit: string | undefined;

      if (run.sandbox.isolation === 'worktree') {
        const diff = (await store.readArtifact(runId, 'diff.patch')) ?? '';
        const applied = await git.applyPatch(diff);
        if (!applied.ok) return await this.applyConflict(run, applied.conflicts);
        commit = diff.trim() ? await git.commit(message) : previousHead;
        await this.cleanupSandbox(run);
      } else if (run.sandbox.isolation === 'branch') {
        // Changes are already staged in the repo on the clicksmith branch.
        if (await git.hasChanges()) await git.commit(message);
        if (run.baseBranch) await git.switchTo(run.baseBranch);
        const merged = await git.merge(run.sandbox.branch!, message);
        if (!merged.ok) return await this.applyConflict(run, merged.conflicts);
        commit = await git.headCommit();
        await git.deleteBranch(run.sandbox.branch!);
      } else {
        // inplace: commit whatever the agent changed in the working tree.
        commit = (await git.hasChanges()) ? await git.commit(message) : previousHead;
      }

      run.status = 'applied';
      run.applied = { ...(commit ? { commit } : {}), at: new Date().toISOString() };
      run.revert = {
        previousHead,
        ...(commit && commit !== previousHead ? { appliedCommit: commit } : {}),
        instructions:
          commit && commit !== previousHead
            ? `git revert ${commit}  # or: git reset --hard ${previousHead}`
            : 'No commit was created; nothing to revert.',
      };
      run.updatedAt = new Date().toISOString();
      await store.saveRun(run);

      bus.emit({ type: 'apply-done', runId, ...(commit ? { commit } : {}) });
      return { applied: true, ...(commit ? { commit } : {}) };
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      logger.error(`apply ${runId} failed`, messageText);
      run.status = 'apply-error';
      run.error = messageText;
      await store.saveRun(run);
      bus.emit({ type: 'apply-error', runId, message: messageText });
      return { applied: false };
    }
  }

  private async applyConflict(run: RunRecord, conflicts: string[]): Promise<ApplyResponse> {
    run.status = 'apply-error';
    run.error = `Apply conflicts in: ${conflicts.join(', ') || 'unknown files'}`;
    run.updatedAt = new Date().toISOString();
    await this.deps.store.saveRun(run);
    this.deps.bus.emit({
      type: 'apply-error',
      runId: run.runId,
      message: run.error,
      conflicts,
    });
    return { applied: false, conflicts };
  }

  private async cleanupSandbox(run: RunRecord): Promise<void> {
    if (!run.repoRoot || !run.sandbox) return;
    if (run.sandbox.isolation === 'worktree') {
      const git = new Git(run.repoRoot);
      await git.removeWorktree(run.sandbox.path, run.sandbox.branch ?? undefined);
    }
  }

  /**
   * Resolve the instruction file passed to the agent. Generated once per daemon
   * session (content only varies by port) and reused across all runs.
   */
  private async resolveInstructionFile(_run: RunRecord): Promise<string> {
    if (this._instructionFile) return this._instructionFile;
    const { config, store } = this.deps;
    const body = renderInstructionBody({ daemonPort: config.port });
    const path = join(store.paths.root, 'AGENT_INSTRUCTIONS.md');
    await writeFile(path, body, 'utf-8');
    this._instructionFile = path;
    return path;
  }
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function unavailableMessage(agentConfig: AgentConfig): string {
  const checked = agentConfig.detect?.anyOf ?? [agentConfig.command];
  return (
    `Agent "${agentConfig.id}" is not available to the ClickSmith daemon. ` +
    `Checked: ${checked.join(', ')}. ` +
    `Install the agent CLI so it is on the daemon PATH, or set command/detect to an absolute path in .clicksmith/agents.config.json.`
  );
}

function availabilityCacheKey(agentConfig: AgentConfig): string {
  return [
    agentConfig.id,
    agentConfig.command,
    ...(agentConfig.detect?.anyOf ?? [agentConfig.command]),
  ].join('\0');
}

function createLogBuffer(
  write: (chunk: string) => Promise<void>,
  onError: (err: unknown) => void,
): { append: (chunk: string) => void; flush: () => Promise<void> } {
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushChain = Promise.resolve();

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!buffer) return flushChain;

    const chunk = buffer;
    buffer = '';
    flushChain = flushChain.then(() => write(chunk)).catch(onError);
    await flushChain;
  }

  return {
    append(chunk) {
      buffer += chunk;
      if (buffer.length >= LOG_FLUSH_BYTES) {
        void flush();
      } else if (!timer) {
        timer = setTimeout(() => void flush(), LOG_FLUSH_MS);
      }
    },
    flush,
  };
}

function buildAgentPrompt(input: {
  bundle: CaptureBundle;
  bundlePath: string;
  run: RunRecord;
}): string {
  const { bundle, bundlePath, run } = input;
  const targets = bundle.elements.map(formatTargetSummary).join('\n');
  const firstActions = buildFirstActions(bundle, bundlePath).map((action, index) => {
    return `${index + 1}. ${action}`;
  });
  const modeLine =
    bundle.execution.mode === 'edit'
      ? 'Mode: edit. Make the smallest working-tree change; do not ask for confirmation.'
      : 'Mode: plan. Inspect only and return a concise plan.';

  return [
    'STOP — do not explore. File and action are below. Execute immediately.',
    '',
    `Request: ${truncateLine(bundle.prompt, 300)}`,
    `Route: ${truncateLine(bundle.app.route, 160)}`,
    '',
    'Targets:',
    targets,
    '',
    'Immediate actions — run ONLY these, in order:',
    ...firstActions,
    '',
    '- DO NOT read AGENTS.md, CLAUDE.md, .cursor/rules, guidelines, skills, or any docs.',
    '- DO NOT call MCP tools, list_mcp_resources, or explore the repo.',
    '- DO NOT run ls, find, git status, or any discovery commands.',
    '- If grep returns only a shared sprite/icon definition, run one more grep for the component usage.',
    '- Keep output brief: changed files only.',
    '',
    modeLine,
  ].join('\n');
}

function formatTargetSummary(element: CapturedElement): string {
  const label = element.el.text || element.el.label || element.el.role || element.el.tag;
  const attrs = formatAttrs(element.el.attrs);
  const locator = formatLocator(element);
  const near = formatNear(element);
  const tokens = collectElementSearchTokens(element).slice(0, 5);
  return [
    `#${element.id} <${element.el.tag}> ${quoteText(label)}`,
    `locator=${locator}`,
    attrs ? `attrs=${attrs}` : '',
    near ? `near=${near}` : '',
    tokens.length ? `tokens=${tokens.map(quoteText).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function formatLocator(element: CapturedElement): string {
  const { locator } = element;
  if (locator.kind === 'source') {
    return `source:${locator.file}:${locator.line}${locator.column != null ? `:${locator.column}` : ''}`;
  }
  if (locator.kind === 'attr') {
    return `attr:${locator.attr}=${quoteText(locator.value)}`;
  }
  if (locator.kind === 'behavioral') {
    return `behavioral:${locator.role} ${quoteText(locator.name)}`;
  }
  return `dom:${truncateLine(locator.selector, 120)}`;
}

function formatAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .slice(0, 5)
    .map(([key, value]) => `${key}=${quoteText(value)}`)
    .join(' ');
}

function formatNear(element: CapturedElement): string {
  return [
    ...(element.near.labels ?? []).slice(0, 1).map((label) => `label=${quoteText(label)}`),
    ...(element.near.headings ?? []).slice(0, 1).map((heading) => `heading=${quoteText(heading)}`),
    ...(element.near.landmarks ?? []).slice(0, 1).map((landmark) => `landmark=${quoteText(landmark)}`),
  ].join(' ');
}

function buildFirstActions(bundle: CaptureBundle, bundlePath: string): string[] {
  const sourceActions = bundle.elements
    .filter((element) => element.locator.kind === 'source')
    .map((element) => {
      if (element.locator.kind !== 'source') return '';
      const start = Math.max(1, element.locator.line - 30);
      const end = element.locator.line + 30;
      return `Open #${element.id} source ${element.locator.file}:${element.locator.line} (for example: sed -n '${start},${end}p' ${shellQuote(element.locator.file)}).`;
    })
    .filter(Boolean);
  if (sourceActions.length) return sourceActions.slice(0, 2);

  const tokens = collectBundleSearchTokens(bundle);
  const actions: string[] = [];
  if (tokens.length) {
    actions.push(`git grep -n ${tokens.slice(0, 2).map((token) => `-e ${shellQuote(token)}`).join(' ')} -- . 2>/dev/null || true`);
  }
  if (tokens.length > 2) {
    actions.push(`git grep -n ${tokens.slice(2, 4).map((token) => `-e ${shellQuote(token)}`).join(' ')} -- . 2>/dev/null || true`);
  }
  if (actions.length) return actions;

  return [`No exact token captured. Read the fallback bundle once: ${bundlePath}`];
}

function collectBundleSearchTokens(bundle: CaptureBundle): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (token: string) => {
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(token);
  };

  for (const element of bundle.elements) {
    for (const token of collectElementSearchTokens(element)) add(token);
  }
  return out.slice(0, 8);
}

function collectElementSearchTokens(element: CapturedElement): string[] {
  const tokens: string[] = [];
  const add = (value: string | undefined) => {
    for (const token of searchTokenVariants(value)) {
      if (!tokens.some((existing) => existing.toLowerCase() === token.toLowerCase())) {
        tokens.push(token);
      }
    }
  };

  if (element.locator.kind === 'attr') add(element.locator.value);
  if (element.locator.kind === 'behavioral') add(element.locator.name);
  for (const token of clicksmithHintTokens(element)) add(token);
  for (const value of Object.values(element.el.attrs)) add(value);
  for (const token of element.el.iconHints ?? []) add(token);
  add(element.el.label);
  add(element.el.text);
  for (const label of element.near.labels ?? []) add(label);
  for (const heading of element.near.headings ?? []) add(heading);
  add(element.near.parentText);

  return tokens.slice(0, 10);
}

function clicksmithHintTokens(element: CapturedElement): string[] {
  const raw = element.frameworkHints?.clicksmith;
  if (!isRecord(raw)) return [];
  const tokens = raw.searchTokens;
  return Array.isArray(tokens) ? tokens.filter((token): token is string => typeof token === 'string') : [];
}

function searchTokenVariants(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 120) return [];
  const variants = [normalized];
  if (normalized.startsWith('#') && normalized.length > 1) variants.unshift(normalized.slice(1));
  if (normalized.includes('/') && !normalized.includes(' ')) {
    variants.push(normalized.split('/').filter(Boolean).at(-1) ?? '');
  }
  return variants
    .map((token) => token.trim().replace(/^["'`#]+|["'`]+$/g, ''))
    .filter((token) => token.length >= 3 && token.length <= 80)
    .filter((token) => !COMMON_SEARCH_TOKENS.has(token.toLowerCase()));
}

function quoteText(value: string): string {
  return JSON.stringify(truncateLine(value, 120));
}

function truncateLine(value: string, max: number): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 3)}...`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COMMON_SEARCH_TOKENS = new Set([
  'button',
  'click',
  'div',
  'false',
  'icon',
  'input',
  'label',
  'link',
  'main',
  'section',
  'span',
  'svg',
  'true',
  'use',
]);
