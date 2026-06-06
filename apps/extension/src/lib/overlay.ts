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
  onApply: (runId: string) => void | Promise<void>;
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

const STYLE = `
:host { all: initial; }
.cs-root { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
  width: 360px; font: 13px/1.4 system-ui, sans-serif; color: #e7e7ea; }
.cs-card { background: #1c1c22; border: 1px solid #34343c; border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0,0,0,.4); overflow: hidden; }
.cs-head { display:flex; align-items:center; justify-content:space-between;
  padding: 10px 12px; background: #232330; font-weight: 600; }
.cs-head-actions { display:flex; align-items:center; gap:8px; }
.cs-badge { font-size: 11px; padding: 2px 6px; border-radius: 6px; background:#34343c; }
.cs-marks { max-height: 180px; overflow:auto; }
.cs-mark { display:flex; gap:8px; align-items:center; padding:8px 12px; border-top:1px solid #2a2a32; }
.cs-id { font-weight:700; color:#a6c8ff; }
.cs-mark .meta { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cs-x { cursor:pointer; color:#ff9a9a; border:none; background:none; font-size:14px; }
.cs-close { cursor:pointer; color:#e7e7ea; border:1px solid #3e3e48; background:#1c1c22;
  border-radius:7px; width:24px; height:24px; line-height:20px; padding:0; }
.cs-close:hover { background:#30303a; }
.cs-body { padding: 10px 12px; display:flex; flex-direction:column; gap:8px; }
textarea { width:100%; box-sizing:border-box; min-height:54px; resize:vertical;
  background:#15151b; color:#e7e7ea; border:1px solid #34343c; border-radius:8px; padding:8px; }
.cs-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
select, button { font: inherit; }
button.cs-primary { background:#3b6fe0; color:#fff; border:none; border-radius:8px;
  padding:8px 12px; cursor:pointer; }
button.cs-primary:disabled { opacity:.5; cursor:not-allowed; }
.cs-log { font-family: ui-monospace, monospace; font-size:11px; white-space:pre-wrap;
  background:#0f0f14; border:1px solid #2a2a32; border-radius:8px; padding:8px;
  max-height:160px; overflow:auto; }
.cs-status { font-size:11px; opacity:.8; }
.cs-dot { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
.cs-dot.on { background:#4ade80; } .cs-dot.off { background:#f87171; }
`;

/**
 * Mount the floating ClickSmith overlay inside a shadow root so the host page's
 * CSS never bleeds in. Returns an imperative handle the content script drives.
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

  const root = el('div', 'cs-root');
  root.style.display = 'none';
  const card = el('div', 'cs-card');
  const head = el('div', 'cs-head');
  const title = el('span');
  title.textContent = '⚒️ ClickSmith';
  const statusBadge = el('span', 'cs-badge');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'cs-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.setAttribute('aria-label', 'Close ClickSmith');
  const headActions = el('div', 'cs-head-actions');
  headActions.append(statusBadge, closeBtn);
  head.append(title, headActions);

  const marksEl = el('div', 'cs-marks');

  const body = el('div', 'cs-body');
  const textarea = document.createElement('textarea');
  textarea.placeholder =
    'Describe the change, referencing #1, #2, … e.g. "make #1 match #2\'s style"';

  const controls = el('div', 'cs-row');
  const modeSel = dropdown(['plan', 'edit'], 'plan');
  const isoSel = dropdown(['worktree', 'branch', 'inplace'], 'worktree');
  const autoApply = checkbox('auto-apply');
  controls.append(label('mode', modeSel), label('isolation', isoSel), autoApply.wrap);

  const submitBtn = document.createElement('button');
  submitBtn.className = 'cs-primary';
  submitBtn.textContent = 'Submit to agent';
  submitBtn.disabled = true;

  const statusLine = el('div', 'cs-status');

  body.append(textarea, controls, submitBtn, statusLine);

  // Run panel (hidden until a run starts).
  const runPanel = el('div', 'cs-body');
  runPanel.style.display = 'none';
  const logEl = el('div', 'cs-log');
  const diffEl = el('div', 'cs-log');
  diffEl.style.display = 'none';
  const applyBtn = document.createElement('button');
  applyBtn.className = 'cs-primary';
  applyBtn.textContent = 'Apply changes';
  applyBtn.disabled = true;
  runPanel.append(logEl, diffEl, applyBtn);

  card.append(head, marksEl, body, runPanel);
  root.append(card);
  shadow.append(root);

  submitBtn.addEventListener('click', () => {
    const prompt = textarea.value.trim();
    if (!prompt || marks.size === 0) return;
    void handlers.onSubmit(prompt, {
      mode: modeSel.value as ExecutionOptions['mode'],
      isolation: isoSel.value as ExecutionOptions['isolation'],
      autoApply: autoApply.input.checked,
    });
  });

  applyBtn.addEventListener('click', () => {
    if (currentRunId) void handlers.onApply(currentRunId);
  });
  closeBtn.addEventListener('click', hide);

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
    root.style.display = visible ? 'block' : 'none';
  }

  function positionNear(anchor: OverlayAnchor): void {
    const gap = 12;
    const panelWidth = Math.min(360, Math.max(280, window.innerWidth - gap * 2));
    const rightSide = anchor.x + anchor.width + gap;
    const leftSide = anchor.x - panelWidth - gap;
    const maxLeft = window.innerWidth - panelWidth - gap;
    const left = rightSide <= maxLeft ? rightSide : Math.max(gap, leftSide);
    const top = clamp(anchor.y, gap, Math.max(gap, window.innerHeight - 240));

    root.style.width = `${panelWidth}px`;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';

    requestAnimationFrame(() => {
      const rect = root.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - gap) {
        root.style.top = `${Math.max(gap, window.innerHeight - rect.height - gap)}px`;
      }
    });
  }

  function handleRunEvent(event: RunEvent): void {
    switch (event.type) {
      case 'agent-started':
        statusLine.textContent = `Agent ${event.agentId} started.`;
        break;
      case 'agent-log':
        logEl.textContent += event.chunk;
        logEl.scrollTop = logEl.scrollHeight;
        break;
      case 'plan-ready':
        if (event.diff) {
          diffEl.style.display = 'block';
          diffEl.textContent = event.diff;
        }
        applyBtn.disabled = false;
        statusLine.textContent = 'Plan ready — review and Apply.';
        break;
      case 'agent-done':
        statusLine.textContent = 'Agent finished.';
        break;
      case 'agent-error':
        statusLine.textContent = `Agent error: ${event.message}`;
        break;
      case 'apply-started':
        statusLine.textContent = 'Applying changes...';
        break;
      case 'apply-done':
        statusLine.textContent = `Applied${event.commit ? ` as ${event.commit.slice(0, 8)}` : ''}.`;
        applyBtn.disabled = true;
        break;
      case 'apply-error':
        statusLine.textContent = `Apply failed: ${event.message}`;
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
      meta.textContent = `${element.el.text || element.el.tag} · ${route} · ${element.locator.kind}`;
      const x = document.createElement('button');
      x.className = 'cs-x';
      x.textContent = '✕';
      x.title = 'Remove';
      x.addEventListener('click', () => void handlers.onRemove(element.id));
      row.append(id, meta, x);
      marksEl.append(row);
      marks.set(element.id, row);
      refreshSubmit();
      show();
    },
    removeMark(elementId) {
      marks.get(elementId)?.remove();
      marks.delete(elementId);
      refreshSubmit();
    },
    setState(state) {
      const on = state.daemonConnected;
      statusBadge.innerHTML = `<span class="cs-dot ${on ? 'on' : 'off'}"></span>${
        state.aiMode ? 'AI Mode' : 'paused'
      }${state.agentId ? ` · ${state.agentId}` : ''}`;
    },
    startRun(runId) {
      currentRunId = runId;
      show();
      runPanel.style.display = 'flex';
      logEl.textContent = '';
      diffEl.style.display = 'none';
      applyBtn.disabled = true;
      statusLine.textContent = `Run ${runId} started…`;
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
      statusLine.textContent = message;
    },
    contains(node) {
      return host.contains(node) || shadow.contains(node);
    },
  };

  /* ---- tiny DOM helpers ---- */
  function el(tag: string, className?: string): HTMLElement {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }
  function dropdown(options: string[], value: string): HTMLSelectElement {
    const sel = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      sel.append(opt);
    }
    sel.value = value;
    return sel;
  }
  function label(text: string, control: HTMLElement): HTMLElement {
    const wrap = el('label', 'cs-row');
    const span = document.createElement('span');
    span.textContent = text;
    wrap.append(span, control);
    return wrap;
  }
  function checkbox(text: string): { wrap: HTMLElement; input: HTMLInputElement } {
    const wrap = el('label', 'cs-row');
    const input = document.createElement('input');
    input.type = 'checkbox';
    const span = document.createElement('span');
    span.textContent = text;
    wrap.append(input, span);
    return { wrap, input };
  }
  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
