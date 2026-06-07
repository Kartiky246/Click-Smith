import { browser } from 'wxt/browser';
import type { BackgroundResponse, ContentToBackground, ExtensionState } from '../../lib/messages';

const agentSel = document.getElementById('agent') as HTMLSelectElement;
const status = document.getElementById('status') as HTMLSpanElement;

async function send(message: ContentToBackground): Promise<unknown> {
  const res = (await browser.runtime.sendMessage(message)) as BackgroundResponse;
  if (!res?.ok) throw new Error(res?.error ?? 'background error');
  return res.result;
}

function render(state: ExtensionState): void {
  if (state.agentId) agentSel.value = state.agentId;
  status.innerHTML = `<span class="dot ${state.daemonConnected ? 'on' : 'off'}"></span>${
    state.daemonConnected ? 'Daemon ready' : 'Daemon offline'
  }`;
}

agentSel.addEventListener('change', () => {
  void send({ type: 'set-agent', agentId: agentSel.value });
});

browser.runtime.onMessage.addListener((msg: { type: string; state?: ExtensionState }) => {
  if (msg.type === 'state' && msg.state) render(msg.state);
});

void send({ type: 'get-state' }).then((s) => render(s as ExtensionState));
