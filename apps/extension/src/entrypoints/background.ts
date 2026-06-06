import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { DaemonClient } from '../lib/daemon-client';
import type {
  BackgroundResponse,
  ContentToBackground,
  ExtensionState,
} from '../lib/messages';
import type { ServerEvent } from '@clicksmith/core';

const STORAGE_KEY = 'clicksmith:state';

export default defineBackground(() => {
  let state: ExtensionState = { aiMode: false, agentId: null, daemonConnected: false };

  const client = new DaemonClient({
    onEvent: (event: ServerEvent) => broadcast({ type: 'daemon-event', event }),
    onConnectionChange: (connected) => {
      state = { ...state, daemonConnected: connected };
      void persist();
      broadcast({ type: 'state', state });
    },
  });

  // Restore persisted toggle state, then connect the daemon WebSocket.
  void browser.storage.local.get(STORAGE_KEY).then((stored) => {
    const saved = stored[STORAGE_KEY] as Partial<ExtensionState> | undefined;
    if (saved) state = { ...state, ...saved, daemonConnected: false };
    client.connect();
  });

  browser.runtime.onMessage.addListener(
    (msg: ContentToBackground, _sender, sendResponse: (r: BackgroundResponse) => void) => {
      handle(msg)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true; // keep the message channel open for the async response
    },
  );

  async function handle(msg: ContentToBackground): Promise<unknown> {
    switch (msg.type) {
      case 'get-state':
        return { ...state, daemonConnected: client.isConnected };
      case 'set-ai-mode':
        state = { ...state, aiMode: msg.enabled };
        await persist();
        broadcast({ type: 'state', state });
        return state;
      case 'set-agent':
        state = { ...state, agentId: msg.agentId };
        await persist();
        return state;
      case 'health':
        return client.health();
      case 'capture':
        return client.capture({
          ...(msg.sessionId ? { sessionId: msg.sessionId } : {}),
          app: msg.app,
          element: msg.element,
        });
      case 'remove-element':
        return client.removeElement(msg.sessionId, msg.elementId);
      case 'submit':
        return client.submit({
          sessionId: msg.sessionId,
          prompt: msg.prompt,
          ...(msg.execution
            ? { execution: { ...(state.agentId ? { agentId: state.agentId } : {}), ...msg.execution } }
            : state.agentId
              ? { execution: { agentId: state.agentId } }
              : {}),
        });
      case 'apply':
        return client.apply(msg.runId);
    }
  }

  async function persist(): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEY]: { aiMode: state.aiMode, agentId: state.agentId },
    });
  }

  function broadcast(event: { type: string }): void {
    // Popup listens via runtime; content scripts via tab messaging.
    browser.runtime.sendMessage(event).catch(() => {});
    void browser.tabs.query({}).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id != null) browser.tabs.sendMessage(tab.id, event).catch(() => {});
      }
    });
  }
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
