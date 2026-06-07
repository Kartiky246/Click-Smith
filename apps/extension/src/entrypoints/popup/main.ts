import { browser } from 'wxt/browser';
import type { BackgroundResponse, ContentToBackground, ExtensionState } from '../../lib/messages';

const agentSel = document.getElementById('agent') as HTMLSelectElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const agentDesc = document.getElementById('agent-desc') as HTMLSpanElement;
const versionEl = document.getElementById('version') as HTMLSpanElement;

const AGENT_DESCRIPTIONS: Record<string, string> = {
  claude: 'Routes prompts via Claude Code CLI',
  cursor: 'Routes prompts via Cursor AI editor',
  codex: 'Routes prompts via OpenAI Codex',
  antigravity: 'Routes prompts via Antigravity agent',
  generic: 'Routes prompts to any generic agent',
};

async function send(message: ContentToBackground): Promise<unknown> {
  const res = (await browser.runtime.sendMessage(message)) as BackgroundResponse;
  if (!res?.ok) throw new Error(res?.error ?? 'background error');
  return res.result;
}

function render(state: ExtensionState): void {
  if (state.agentId) {
    agentSel.value = state.agentId;
    agentDesc.textContent = AGENT_DESCRIPTIONS[state.agentId] ?? 'Routes prompts to selected agent';
  }
  const online = state.daemonConnected;
  statusEl.className = `pill ${online ? 'on' : 'off'}`;
  statusText.textContent = online ? 'ClickSmith ready' : 'Not connected';
}

agentSel.addEventListener('change', () => {
  const id = agentSel.value;
  agentDesc.textContent = AGENT_DESCRIPTIONS[id] ?? 'Routes prompts to selected agent';
  void send({ type: 'set-agent', agentId: id });
});

browser.runtime.onMessage.addListener((msg: { type: string; state?: ExtensionState }) => {
  if (msg.type === 'state' && msg.state) render(msg.state);
});

try {
  const manifest = browser.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
} catch {
  versionEl.textContent = 'v—';
}

void send({ type: 'get-state' }).then((s) => render(s as ExtensionState));
