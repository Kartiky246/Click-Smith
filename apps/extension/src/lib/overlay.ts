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
* { box-sizing: border-box; }

.cs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: none;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
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
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", sans-serif;
  color: #ebebeb;
  -webkit-font-smoothing: antialiased;
}

.cs-card {
  display: flex;
  max-height: inherit;
  flex-direction: column;
  overflow: hidden;
  background: #1e1e1e;
  border: 1px solid #2e2e2e;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
}

.cs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 16px 11px;
  border-bottom: 1px solid #2e2e2e;
  background: #242424;
  cursor: grab;
  user-select: none;
}

.cs-head.dragging { cursor: grabbing; }
.cs-head button { cursor: pointer; }

.cs-title-wrap { min-width: 0; }

.cs-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cs-brand-icon {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #4f6ef7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cs-brand-icon svg { width: 12px; height: 12px; }

.cs-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #ebebeb;
  letter-spacing: -0.2px;
}

.cs-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: #555;
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
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid #3a3a3a;
  color: #999;
}

.cs-badge.online {
  border-color: rgba(34,197,94,.25);
  color: #22c55e;
}

.cs-badge.offline {
  border-color: rgba(248,113,113,.2);
  color: #f87171;
}

.cs-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.cs-badge.online .cs-dot { animation: cs-blink 2s infinite; }

@keyframes cs-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: .35; }
}

.cs-close {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid #2e2e2e;
  border-radius: 6px;
  background: transparent;
  color: #555;
  cursor: pointer;
  font: 500 14px/1 inherit;
  transition: background 0.1s, color 0.1s;
}

.cs-close:hover { background: #2e2e2e; color: #ebebeb; }

.cs-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 13px 16px 15px;
  overflow: auto;
  background: #1a1a1a;
}

.cs-section-title {
  margin: 0 0 7px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .07em;
  color: #555;
  text-transform: uppercase;
}

.cs-marks {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 136px;
  overflow: auto;
}

.cs-mark {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 8px;
  border: 1px solid #2e2e2e;
  border-radius: 6px;
  background: #242424;
}

.cs-id {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(79,110,247,.12);
  color: #6b84f5;
  font-size: 11px;
  font-weight: 600;
}

.cs-mark .meta {
  min-width: 0;
  overflow: hidden;
  color: #777;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
}

.cs-x {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #555;
  cursor: pointer;
  font: 500 13px/1 inherit;
  transition: background 0.1s, color 0.1s;
}

.cs-x:hover { background: #2e2e2e; color: #ebebeb; }

textarea {
  width: 100%;
  min-height: 84px;
  box-sizing: border-box;
  resize: vertical;
  padding: 9px 11px;
  border: 1px solid #2e2e2e;
  border-radius: 6px;
  outline: none;
  background: #242424;
  color: #ebebeb;
  font: inherit;
  font-size: 13px;
  transition: border-color 0.15s;
}

textarea::placeholder { color: #555; }

textarea:focus {
  border-color: #4f6ef7;
  box-shadow: 0 0 0 2px rgba(79,110,247,.12);
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
  min-height: 32px;
  padding: 0 14px;
  border-radius: 6px;
  cursor: pointer;
  font: 500 13px/1 inherit;
  transition: background 0.1s, border-color 0.1s;
}

.cs-primary {
  border: 1px solid #4f6ef7;
  background: #4f6ef7;
  color: #fff;
}

.cs-primary:hover { background: #3d5ce8; border-color: #3d5ce8; }
.cs-primary:disabled { opacity: .35; cursor: not-allowed; }

.cs-ghost {
  border: 1px solid #2e2e2e;
  background: transparent;
  color: #999;
}

.cs-ghost:hover { background: #272727; border-color: #3a3a3a; color: #ebebeb; }
.cs-ghost:disabled { opacity: .35; cursor: not-allowed; }

.cs-inline-status {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 18px;
  color: #555;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.cs-run-panel {
  display: none;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 15px;
  background: #1a1a1a;
}

.cs-stage {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 11px;
  border: 1px solid #2e2e2e;
  border-radius: 7px;
  background: #242424;
}

.cs-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid #333;
  border-top-color: #4f6ef7;
  animation: cs-spin 0.7s linear infinite;
}

.cs-stage.is-done .cs-spinner {
  border: none;
  background: #22c55e;
  animation: none;
}

.cs-stage.is-done .cs-spinner::after {
  content: '';
  display: block;
  width: 7px;
  height: 4px;
  border-left: 1.5px solid #fff;
  border-bottom: 1.5px solid #fff;
  transform: rotate(-45deg) translateY(-1px);
}

.cs-stage.is-error .cs-spinner {
  border: none;
  background: #ef4444;
  animation: none;
  font: 600 10px/1 inherit;
  color: #fff;
}

.cs-stage.is-error .cs-spinner::after {
  content: '✕';
  color: #fff;
  font-size: 9px;
}

.cs-hint {
  margin-top: 5px;
  font: 11px/1.4 'SF Mono', 'Fira Code', ui-monospace, monospace;
  color: #4f6ef7;
  opacity: 0;
  transition: opacity 0.3s ease;
  min-height: 14px;
}

.cs-hint.visible { opacity: 0.6; }
.cs-stage:not(.is-spinning) .cs-hint { display: none; }

.cs-stage-title {
  overflow-wrap: anywhere;
  color: #ebebeb;
  font-weight: 600;
}

.cs-stage-detail {
  margin-top: 2px;
  overflow-wrap: anywhere;
  color: #777;
  font-size: 12px;
}

.cs-stage-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 2px;
}

.cs-stage-meta .cs-stage-detail { min-width: 0; margin-top: 0; }

.cs-elapsed {
  flex: 0 0 auto;
  color: #555;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
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
  gap: 6px;
}

.cs-log {
  display: none;
  max-height: 180px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 10px;
  border: 1px solid #2e2e2e;
  border-radius: 6px;
  background: #141414;
  color: #777;
  font: 11px/1.5 'SF Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
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

  const LOADING_HINTS = [
    '▸ Reading element context...',
    '▸ Analyzing DOM structure...',
    '▸ Reasoning about the change...',
    '▸ Building a plan...',
    '▸ Mapping component tree...',
    '▸ Extracting attributes...',
    '▸ Thinking through edge cases...',
    '▸ Preparing edit context...',
    '▸ Bundling element data...',
    '▸ Checking surrounding code...',
    '▸ Generating prompt...',
    '▸ Connecting to agent...',
  ];

  const marks = new Map<number, HTMLElement>();
  const pendingEvents = new Map<string, RunEvent[]>();
  let currentRunId: string | null = null;
  let visible = false;
  let terminalOpen = false;
  let runStartedAt = 0;
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let hintTimer: ReturnType<typeof setInterval> | null = null;
  let hintIdx = 0;

  const backdrop = el('button', 'cs-backdrop');
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Close ClickSmith');

  const root = el('div', 'cs-root');
  const card = el('div', 'cs-card');

  const head = el('div', 'cs-head');
  const titleWrap = el('div', 'cs-title-wrap');
  const brandRow = el('div', 'cs-brand');
  const brandIcon = el('div', 'cs-brand-icon');
  brandIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>`;
  const title = el('span', 'cs-title');
  title.innerHTML = 'Click<span>Smith</span>';
  brandRow.append(brandIcon, title);
  const subtitle = el('div', 'cs-subtitle');
  subtitle.textContent = 'Edit the selected UI element';
  titleWrap.append(brandRow, subtitle);

  const statusBadge = el('span', 'cs-badge offline');
  const statusDot = el('span', 'cs-dot');
  const statusText = document.createTextNode('Not connected');
  statusBadge.append(statusDot, statusText);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cs-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
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
  const hintEl = el('div', 'cs-hint');
  stageCopy.append(stageTitle, stageMeta, hintEl);
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

  // ── Drag to reposition ────────────────────────────────────────────────────────
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  head.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('button')) return;
    isDragging = true;
    const rect = root.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    head.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const gap = 8;
    const x = clamp(e.clientX - dragOffsetX, gap, window.innerWidth - root.offsetWidth - gap);
    const y = clamp(e.clientY - dragOffsetY, gap, window.innerHeight - root.offsetHeight - gap);
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    head.classList.remove('dragging');
  });

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
    stopHints();
    // If the run has completed, fully reset so the next alt+click opens a clean modal.
    if (stage.classList.contains('is-done') || stage.classList.contains('is-error')) {
      runPanel.style.display = 'none';
      stage.classList.remove('is-done', 'is-error', 'is-spinning');
      logEl.textContent = '';
      copyLogsBtn.disabled = true;
      setTerminalOpen(false);
      stopElapsedTimer();
      runStartedAt = 0;
      currentRunId = null;
      textarea.value = '';
      refreshSubmit();
    }
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
    if (spinning) startHints();
    else stopHints();
  }

  function startHints(): void {
    hintIdx = Math.floor(Math.random() * LOADING_HINTS.length);
    hintEl.textContent = LOADING_HINTS[hintIdx];
    hintEl.classList.add('visible');
    if (hintTimer) clearInterval(hintTimer);
    hintTimer = setInterval(() => {
      hintEl.classList.remove('visible');
      setTimeout(() => {
        hintIdx = (hintIdx + 1) % LOADING_HINTS.length;
        hintEl.textContent = LOADING_HINTS[hintIdx];
        hintEl.classList.add('visible');
      }, 360);
    }, 2000);
  }

  function stopHints(): void {
    if (hintTimer) { clearInterval(hintTimer); hintTimer = null; }
    hintEl.classList.remove('visible');
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

  function clearAllMarks(): void {
    for (const row of marks.values()) row.remove();
    marks.clear();
    refreshSubmit();
    statusLine.textContent = 'Alt+Click another element to select it.';
  }

  function prepareRunUi(): void {
    runPanel.style.display = 'flex';
    logEl.textContent = '';
    copyLogsBtn.disabled = true;
    setTerminalOpen(false);
    stage.classList.remove('is-done', 'is-error');
    runStartedAt = 0;
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
        setStage(`Handed off to ${event.agentId}`, 'Agent is running in your editor.', false);
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
        stage.classList.add('is-done');
        setStage('Agent finished', 'Review the changed files in your editor.', false);
        clearAllMarks();
        break;
      case 'agent-error':
        stopElapsedTimer();
        stage.classList.add('is-error');
        setStage('Agent error', event.message, false);
        clearAllMarks();
        break;
      case 'apply-started':
        stage.classList.remove('is-done', 'is-error');
        setStage('Applying changes', '', true);
        break;
      case 'apply-done':
        stage.classList.add('is-done');
        setStage(
          'Changes applied',
          event.commit ? `Commit ${event.commit.slice(0, 8)} created.` : 'No commit was created.',
          false,
        );
        break;
      case 'apply-error':
        stage.classList.add('is-error');
        setStage('Apply failed', event.message, false);
        break;
    }
  }

  return {
    addMark(element, route, anchor) {
      if (anchor && !visible) positionNear(anchor);
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
      statusBadge.className = `cs-badge ${connected ? 'online' : 'offline'}`;
      const label = connected ? 'ClickSmith ready' : 'Not connected';
      const suffix = state.agentId ? ` · ${state.agentId}` : '';
      statusBadge.replaceChildren(statusDot, document.createTextNode(label + suffix));
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
