import type { CapturedElement, ExecutionOptions, ServerEvent } from '@clicksmith/core';
import type { ExtensionState } from '../lib/messages';

type RunEvent = Extract<ServerEvent, { runId: string }>;

export interface OverlayAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayHandlers {
  onRemove: (elementId: number) => void | Promise<void>;
  onSubmit: (prompt: string, execution: Partial<ExecutionOptions>) => void | Promise<void>;
}

export interface Overlay {
  addMark(element: CapturedElement, route: string, anchor?: OverlayAnchor): void;
  removeMark(elementId: number): void;
  setState(state: ExtensionState): void;
  startRun(runId: string): void;
  onDaemonEvent(event: ServerEvent): void;
  toast(message: string): void;
  contains(node: Node): boolean;
}

const EDIT_INPLACE_EXECUTION: Partial<ExecutionOptions> = {
  mode: 'edit',
  isolation: 'inplace',
  autoApply: false,
};

const STYLE = `
:host { all: initial; }
.cs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: none;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: rgba(248, 250, 252, .68);
  backdrop-filter: blur(1.5px);
  cursor: default;
}
.cs-root {
  position: fixed;
  right: 24px;
  top: 24px;
  z-index: 2147483647;
  display: none;
  width: 420px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  font: 13px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #172033;
}
.cs-card {
  display: flex;
  max-height: inherit;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  border: 1px solid #d8dee9;
  border-radius: 8px;
  box-shadow: 0 22px 60px rgba(15, 23, 42, .22), 0 4px 16px rgba(15, 23, 42, .12);
}
.cs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #e7ebf2;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}
.cs-title-wrap { min-width: 0; }
.cs-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0;
  color: #101827;
}
.cs-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: #667085;
}
.cs-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.cs-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid #dbe3ef;
  border-radius: 999px;
  background: #f8fafc;
  color: #475467;
  font-size: 11px;
  font-weight: 600;
}
.cs-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: #ef4444;
}
.cs-dot.on { background: #16a34a; }
.cs-close {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #d8dee9;
  border-radius: 7px;
  background: #fff;
  color: #475467;
  cursor: pointer;
  font: inherit;
  font-size: 16px;
  line-height: 1;
}
.cs-close:hover { background: #f3f6fa; color: #111827; }
.cs-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px 16px;
  overflow: auto;
}
.cs-section-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  color: #667085;
  text-transform: uppercase;
}
.cs-marks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 136px;
  overflow: auto;
}
.cs-mark {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid #e5eaf1;
  border-radius: 7px;
  background: #fbfcfe;
}
.cs-id {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: #eef5ff;
  color: #175cd3;
  font-size: 12px;
  font-weight: 700;
}
.cs-mark .meta {
  min-width: 0;
  overflow: hidden;
  color: #344054;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs-x {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #98a2b3;
  cursor: pointer;
  font: inherit;
  font-size: 15px;
}
.cs-x:hover { background: #eef2f7; color: #344054; }
textarea {
  width: 100%;
  min-height: 86px;
  box-sizing: border-box;
  resize: vertical;
  padding: 10px 11px;
  border: 1px solid #cfd8e6;
  border-radius: 7px;
  outline: none;
  background: #fff;
  color: #101827;
  font: inherit;
}
textarea:focus {
  border-color: #2f6fed;
  box-shadow: 0 0 0 3px rgba(47, 111, 237, .12);
}
.cs-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.cs-primary,
.cs-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  font-weight: 650;
}
.cs-primary {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #fff;
}
.cs-primary:hover { background: #1d4ed8; border-color: #1d4ed8; }
.cs-primary:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.cs-ghost {
  border: 1px solid #d8dee9;
  background: #fff;
  color: #344054;
}
.cs-ghost:hover { background: #f8fafc; }
.cs-ghost:disabled {
  opacity: .55;
  cursor: not-allowed;
}
.cs-inline-status {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 18px;
  color: #667085;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.cs-run-panel {
  display: none;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 16px;
}
.cs-stage {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 11px;
  border: 1px solid #dbe7ff;
  border-radius: 7px;
  background: #f6f9ff;
}
.cs-spinner {
  display: inline-block;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  border: 2px solid #bdd2ff;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: cs-spin .8s linear infinite;
}
.cs-stage:not(.is-spinning) .cs-spinner {
  border-color: #22c55e;
  border-top-color: #22c55e;
  animation: none;
}
.cs-stage-title {
  overflow-wrap: anywhere;
  color: #172033;
  font-weight: 700;
}
.cs-stage-detail {
  margin-top: 2px;
  overflow-wrap: anywhere;
  color: #5f6c80;
  font-size: 12px;
}
.cs-stage-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}
.cs-stage-meta .cs-stage-detail {
  min-width: 0;
  margin-top: 0;
}
.cs-elapsed {
  flex: 0 0 auto;
  color: #475467;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.cs-terminal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cs-terminal-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cs-log {
  display: none;
  max-height: 180px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 10px;
  border: 1px solid #d8dee9;
  border-radius: 7px;
  background: #111827;
  color: #e5e7eb;
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
@keyframes cs-spin { to { transform: rotate(360deg); } }
`;

/**
 * Mount the ClickSmith overlay inside a shadow root so the host page's CSS
 * never bleeds in. Returns an imperative handle the content script drives.
 */
export function mountOverlay(handlers: OverlayHandlers): Overlay {
  const host = document.createElement('div');
  host.id = 'clicksmith-overlay-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.append(style);
  document.documentElement.append(host);

  const marks = new Map<number, HTMLElement>();
  const pendingEvents = new Map<string, RunEvent[]>();
  let currentRunId: string | null = null;
  let visible = false;
  let terminalOpen = false;
  let runStartedAt = 0;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  const backdrop = el('button', 'cs-backdrop');
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Close ClickSmith');

  const root = el('div', 'cs-root');
  const card = el('div', 'cs-card');

  const head = el('div', 'cs-head');
  const titleWrap = el('div', 'cs-title-wrap');
  const title = el('span', 'cs-title');
  title.textContent = 'ClickSmith';
  const subtitle = el('div', 'cs-subtitle');
  subtitle.textContent = 'Edit the selected UI element';
  titleWrap.append(title, subtitle);

  const statusBadge = el('span', 'cs-badge');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cs-close';
  closeBtn.type = 'button';
  closeBtn.textContent = 'x';
  closeBtn.title = 'Close';
  closeBtn.setAttribute('aria-label', 'Close ClickSmith');
  const headActions = el('div', 'cs-head-actions');
  headActions.append(statusBadge, closeBtn);
  head.append(titleWrap, headActions);

  const body = el('div', 'cs-body');
  const marksTitle = el('div', 'cs-section-title');
  marksTitle.textContent = 'Selected target';
  const marksEl = el('div', 'cs-marks');

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Tell the agent what to change on the selected element.';

  const actions = el('div', 'cs-actions');
  const statusLine = el('div', 'cs-inline-status');
  const submitBtn = document.createElement('button');
  submitBtn.className = 'cs-primary';
  submitBtn.textContent = 'Submit to agent';
  submitBtn.disabled = true;
  actions.append(statusLine, submitBtn);
  body.append(marksTitle, marksEl, textarea, actions);

  const runPanel = el('div', 'cs-run-panel');
  const stage = el('div', 'cs-stage');
  const spinner = el('span', 'cs-spinner');
  const stageCopy = el('div');
  const stageTitle = el('div', 'cs-stage-title');
  const stageMeta = el('div', 'cs-stage-meta');
  const stageDetail = el('div', 'cs-stage-detail');
  const elapsedEl = el('span', 'cs-elapsed');
  stageMeta.append(stageDetail, elapsedEl);
  stageCopy.append(stageTitle, stageMeta);
  stage.append(spinner, stageCopy);

  const terminalBar = el('div', 'cs-terminal-bar');
  const terminalStatus = el('div', 'cs-inline-status');
  terminalStatus.textContent = 'Terminal hidden by default';
  const terminalActions = el('div', 'cs-terminal-actions');
  const copyLogsBtn = document.createElement('button');
  copyLogsBtn.className = 'cs-ghost';
  copyLogsBtn.type = 'button';
  copyLogsBtn.textContent = 'Copy logs';
  copyLogsBtn.disabled = true;
  const terminalToggle = document.createElement('button');
  terminalToggle.className = 'cs-ghost';
  terminalToggle.type = 'button';
  terminalToggle.textContent = 'Show terminal';
  terminalActions.append(copyLogsBtn, terminalToggle);
  terminalBar.append(terminalStatus, terminalActions);

  const logEl = el('pre', 'cs-log');
  runPanel.append(stage, terminalBar, logEl);

  card.append(head, body, runPanel);
  root.append(card);
  shadow.append(backdrop, root);

  submitBtn.addEventListener('click', () => {
    const prompt = textarea.value.trim();
    if (!prompt || marks.size === 0) return;
    prepareRunUi();
    startElapsedTimer();
    setStage('Connecting to daemon', 'Submitting element context…', true);
    statusLine.textContent = 'Handing context to the agent…';
    submitBtn.disabled = true;
    void handlers.onSubmit(prompt, EDIT_INPLACE_EXECUTION);
  });

  copyLogsBtn.addEventListener('click', () => {
    void copyLogs();
  });
  terminalToggle.addEventListener('click', () => {
    setTerminalOpen(!terminalOpen);
  });
  closeBtn.addEventListener('click', hide);
  backdrop.addEventListener('click', hide);
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hide();
    },
    true,
  );

  function refreshSubmit(): void {
    submitBtn.disabled = marks.size === 0 || textarea.value.trim().length === 0;
  }
  textarea.addEventListener('input', refreshSubmit);

  function show(): void {
    visible = true;
    syncVisibility();
  }

  function hide(): void {
    visible = false;
    syncVisibility();
  }

  function syncVisibility(): void {
    backdrop.style.display = visible ? 'block' : 'none';
    root.style.display = visible ? 'block' : 'none';
  }

  function positionNear(anchor: OverlayAnchor): void {
    const gap = 12;
    const panelWidth = Math.min(420, Math.max(320, window.innerWidth - gap * 2));
    const rightSide = anchor.x + anchor.width + gap;
    const leftSide = anchor.x - panelWidth - gap;
    const maxLeft = window.innerWidth - panelWidth - gap;
    const left = rightSide <= maxLeft ? rightSide : Math.max(gap, leftSide);
    const top = clamp(anchor.y - 6, gap, Math.max(gap, window.innerHeight - 440));

    root.style.width = `${panelWidth}px`;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';

    requestAnimationFrame(() => {
      const rect = root.getBoundingClientRect();
      if (rect.right > window.innerWidth - gap) {
        root.style.left = `${Math.max(gap, window.innerWidth - rect.width - gap)}px`;
      }
      if (rect.bottom > window.innerHeight - gap) {
        root.style.top = `${Math.max(gap, window.innerHeight - rect.height - gap)}px`;
      }
    });
  }

  function setStage(titleText: string, detailText = '', spinning = true): void {
    stage.classList.toggle('is-spinning', spinning);
    stageTitle.textContent = titleText;
    stageDetail.textContent = detailText;
    updateElapsed();
  }

  function appendTerminal(chunk: string): void {
    logEl.textContent += chunk;
    logEl.scrollTop = logEl.scrollHeight;
    copyLogsBtn.disabled = logEl.textContent.length === 0;
    terminalStatus.textContent = terminalOpen ? 'Terminal output' : 'Terminal output available';
  }

  function setTerminalOpen(open: boolean): void {
    terminalOpen = open;
    logEl.style.display = open ? 'block' : 'none';
    terminalToggle.textContent = open ? 'Hide terminal' : 'Show terminal';
    terminalStatus.textContent = open
      ? 'Terminal output'
      : logEl.textContent
        ? 'Terminal output available'
        : 'Terminal hidden by default';
  }

  function prepareRunUi(): void {
    runPanel.style.display = 'flex';
    logEl.textContent = '';
    copyLogsBtn.disabled = true;
    setTerminalOpen(false);
  }

  function startElapsedTimer(): void {
    runStartedAt = Date.now();
    updateElapsed();
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = setInterval(updateElapsed, 1000);
  }

  function stopElapsedTimer(): void {
    updateElapsed();
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function updateElapsed(): void {
    elapsedEl.textContent = runStartedAt
      ? `Elapsed ${formatElapsed(Date.now() - runStartedAt)}`
      : '';
  }

  async function copyLogs(): Promise<void> {
    const logs = logEl.textContent;
    if (!logs) return;
    try {
      const copied = await copyText(logs);
      terminalStatus.textContent = copied ? 'Logs copied' : 'Copy failed';
    } catch {
      terminalStatus.textContent = 'Copy failed';
    }
  }

  function handleRunEvent(event: RunEvent): void {
    switch (event.type) {
      case 'agent-started':
        stopElapsedTimer();
        setStage(`Handed off to ${event.agentId}`, 'Agent is running in your editor.', false);
        setTimeout(hide, 1500);
        break;
      case 'agent-log':
        appendTerminal(event.chunk);
        break;
      case 'plan-ready':
        if (event.plan) appendTerminal(`\n${event.plan}\n`);
        if (event.diff) appendTerminal(`\n${event.diff}\n`);
        setStage('Agent response ready', 'Review the changed files in your editor.', false);
        break;
      case 'agent-done':
        stopElapsedTimer();
        setStage('Agent finished', 'Review the changed files in your editor.', false);
        refreshSubmit();
        break;
      case 'agent-error':
        stopElapsedTimer();
        setStage('Agent error', event.message, false);
        refreshSubmit();
        break;
      case 'apply-started':
        setStage('Applying changes', '', true);
        break;
      case 'apply-done':
        setStage(
          'Changes applied',
          event.commit ? `Commit ${event.commit.slice(0, 8)} created.` : 'No commit was created.',
          false,
        );
        break;
      case 'apply-error':
        setStage('Apply failed', event.message, false);
        break;
    }
  }

  return {
    addMark(element, route, anchor) {
      if (anchor) positionNear(anchor);
      const row = el('div', 'cs-mark');
      const id = el('span', 'cs-id');
      id.textContent = `#${element.id}`;
      const meta = el('span', 'meta');
      meta.textContent = `${element.el.text || element.el.label || element.el.tag} | ${route} | ${element.locator.kind}`;
      const x = document.createElement('button');
      x.className = 'cs-x';
      x.type = 'button';
      x.textContent = 'x';
      x.title = 'Remove';
      x.setAttribute('aria-label', `Remove #${element.id}`);
      x.addEventListener('click', () => void handlers.onRemove(element.id));
      row.append(id, meta, x);
      marksEl.append(row);
      marks.set(element.id, row);
      statusLine.textContent = '';
      refreshSubmit();
      show();
    },
    removeMark(elementId) {
      marks.get(elementId)?.remove();
      marks.delete(elementId);
      refreshSubmit();
      if (marks.size === 0) statusLine.textContent = 'Alt+Click another element to select it.';
    },
    setState(state) {
      const connected = state.daemonConnected;
      statusBadge.innerHTML = `<span class="cs-dot ${connected ? 'on' : ''}"></span>${
        connected ? 'Daemon ready' : 'Daemon offline'
      }${state.agentId ? ` | ${state.agentId}` : ''}`;
    },
    startRun(runId) {
      currentRunId = runId;
      show();
      if (!runStartedAt) {
        prepareRunUi();
        startElapsedTimer();
      } else {
        runPanel.style.display = 'flex';
      }
      setStage('Starting agent', 'Sending element context…', true);
      statusLine.textContent = '';
      const queued = pendingEvents.get(runId) ?? [];
      pendingEvents.delete(runId);
      for (const event of queued) handleRunEvent(event);
    },
    onDaemonEvent(event) {
      if (!('runId' in event)) return;
      if (event.runId !== currentRunId) {
        const queued = pendingEvents.get(event.runId) ?? [];
        queued.push(event);
        pendingEvents.set(event.runId, queued);
        return;
      }
      handleRunEvent(event);
    },
    toast(message) {
      show();
      if (/failed|error/i.test(message)) stopElapsedTimer();
      statusLine.textContent = message;
      refreshSubmit();
    },
    contains(node) {
      return host.contains(node) || shadow.contains(node);
    },
  };

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  function formatElapsed(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    return `${minutes}:${pad2(seconds)}`;
  }

  function pad2(value: number): string {
    return String(value).padStart(2, '0');
  }

  async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the selection-based fallback below.
      }
    }

    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    document.documentElement.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    return copied;
  }
}
