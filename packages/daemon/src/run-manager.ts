import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  configToAdapter,
  defaultBinExists,
  renderInstructionBody,
  resolveAgent,
  type AgentConfig,
  type AgentLaunchContext,
} from '@clicksmith/agent-config';
import {
  newRunId,
  type ApplyResponse,
  type CaptureBundle,
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

export class RunManager {
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
      throw new RefusalError(`No agent configured (requested: ${input.execution.agentId ?? 'default'}).`);
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
      baseCommit = await git.headCommit();
      baseBranch = await safe(() => git.currentBranch());
      const baseRef = input.execution.baseRef ?? baseCommit;

      if (isolation !== 'inplace' && (await git.isDirty({ exclude: ['.clicksmith/', '.clicksmith'] }))) {
        throw new RefusalError(
          `Refusing to run in ${isolation} isolation: the working tree has uncommitted changes. ` +
            `Commit or stash them, or use inplace isolation explicitly.`,
        );
      }
      sandbox = await this.prepareSandbox(git, runId, isolation, baseRef, repoRoot, baseCommit, logger);
    }

    const enriched = await enrichBundle(input, this.deps.enrichment);
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

    bus.emit({ type: 'agent-started', runId, sessionId: run.sessionId, agentId: run.agentId, sandbox });

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

  private async execute(run: RunRecord, bundle: CaptureBundle, agentConfig: AgentConfig): Promise<void> {
    const { store, config, bus, logger } = this.deps;
    const sandboxPath = run.sandbox?.path ?? config.cwd;

    const instructionFile = await this.resolveInstructionFile(run, agentConfig);
    const ctx: AgentLaunchContext = {
      bundlePath: store.bundlePath(run.runId),
      prompt: bundle.prompt,
      instructionFile,
      mode: bundle.execution.mode,
      mcpServer: 'clicksmith',
      cwd: sandboxPath,
      isolation: run.isolation,
      agentId: agentConfig.id,
      binExists: this.deps.binExists ?? defaultBinExists,
    };

    const adapter = configToAdapter(agentConfig);
    if (!(await adapter.isAvailable(ctx))) {
      await this.fail(run, `Agent "${agentConfig.id}" is not available on PATH.`);
      return;
    }

    const spec = adapter.buildCommand(ctx);
    logger.info(`run ${run.runId}: ${spec.command} ${spec.args.join(' ')}`);

    let result;
    try {
      result = await launchAgent(spec, {
        onLog: (stream, chunk) => {
          void store.appendLog(run.runId, chunk);
          bus.emit({ type: 'agent-log', runId: run.runId, stream, chunk });
        },
      });
    } catch (err) {
      await this.fail(run, err instanceof Error ? err.message : String(err));
      return;
    }

    // Capture artifacts from the sandbox.
    const plan = result.stdout.trim();
    let diff = '';
    if (run.sandbox && run.repoRoot) {
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
      logger.info(`run ${run.runId}: autoApply enabled, applying`);
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
   * Resolve the instruction file passed to the agent. Prefer the project's
   * rendered file if it exists; otherwise write a run-local one from the shared
   * template so every agent always has instructions.
   */
  private async resolveInstructionFile(run: RunRecord, agentConfig: AgentConfig): Promise<string> {
    const { config, store } = this.deps;
    if (config.repoRoot && agentConfig.instructions) {
      const projectFile = join(config.repoRoot, agentConfig.instructions.file);
      if (await fileExists(projectFile)) return projectFile;
    }
    const body = renderInstructionBody({ daemonPort: config.port });
    return store.writeArtifact(run.runId, 'AGENT_INSTRUCTIONS.md', body);
  }
}

async function fileExists(path: string): Promise<boolean> {
  const { access } = await import('node:fs/promises');
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
