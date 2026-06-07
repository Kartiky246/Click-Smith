import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { DaemonClient } from '../lib/daemon-client';
import type { BackgroundResponse, ContentToBackground, ExtensionState } from '../lib/messages';
import type { ServerEvent } from '@clicksmith/core';

const STORAGE_KEY = 'clicksmith:state';

type MessageSender = { tab?: { id?: number } };
type DaemonBackgroundEvent = { type: 'daemon-event'; event: ServerEvent };

export default defineBackground(() => {
  let state: ExtensionState = { aiMode: true, agentId: null, daemonConnected: false };
  const sessionTabs = new Map<string, number>();
  const runTabs = new Map<string, number>();

  const client = new DaemonClient({
    onEvent: (event: ServerEvent) => broadcastDaemonEvent(event),
    onConnectionChange: (connected) => {
      state = { ...state, daemonConnected: connected };
      void persist();
      broadcast({ type: 'state', state });
    },
  });

  // Restore persisted agent choice, then connect the daemon WebSocket.
  void browser.storage.local.get(STORAGE_KEY).then((stored) => {
    const saved = stored[STORAGE_KEY] as Partial<ExtensionState> | undefined;
    if (saved)
      state = { ...state, agentId: saved.agentId ?? null, aiMode: true, daemonConnected: false };
    client.connect();
  });

  browser.runtime.onMessage.addListener(
    (msg: ContentToBackground, sender, sendResponse: (r: BackgroundResponse) => void) => {
      handle(msg, sender)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }));
      return true; // keep the message channel open for the async response
    },
  );

  async function handle(msg: ContentToBackground, sender: MessageSender): Promise<unknown> {
    switch (msg.type) {
      case 'get-state':
        return { ...state, aiMode: true, daemonConnected: client.isConnected };
      case 'set-ai-mode':
        state = { ...state, aiMode: true };
        await persist();
        broadcast({ type: 'state', state });
        return state;
      case 'set-agent':
        state = { ...state, agentId: msg.agentId };
        await persist();
        broadcast({ type: 'state', state });
        return state;
      case 'health':
        return client.health();
      case 'capture':
        return client
          .capture({
            ...(msg.sessionId ? { sessionId: msg.sessionId } : {}),
            app: msg.app,
            element: msg.element,
          })
          .then((result) => {
            rememberSessionTab(result.sessionId, sender);
            return result;
          });
      case 'remove-element':
        return client.removeElement(msg.sessionId, msg.elementId);
      case 'run':
        return client
          .run({
            app: msg.app,
            elements: msg.elements,
            prompt: msg.prompt,
            execution: {
              ...(state.agentId ? { agentId: state.agentId } : {}),
              ...(msg.execution ?? {}),
              mode: 'edit',
              isolation: 'inplace',
              autoApply: false,
            },
          })
          .then((result) => {
            rememberSessionTab(result.sessionId, sender);
            runTabs.set(result.runId, tabIdFrom(sender) ?? 0);
            client.watchRun(result.runId);
            return result;
          });
      case 'submit':
        return client
          .submit({
            sessionId: msg.sessionId,
            prompt: msg.prompt,
            execution: {
              ...(state.agentId ? { agentId: state.agentId } : {}),
              ...(msg.execution ?? {}),
              mode: 'edit',
              isolation: 'inplace',
              autoApply: false,
            },
          })
          .then((result) => {
            const tabId = tabIdFrom(sender) ?? sessionTabs.get(msg.sessionId);
            if (tabId != null) runTabs.set(result.runId, tabId);
            client.watchRun(result.runId);
            return result;
          });
      case 'apply':
        return client.apply(msg.runId);
    }
  }

  async function persist(): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEY]: { aiMode: true, agentId: state.agentId },
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

  function broadcastDaemonEvent(event: ServerEvent): void {
    if (event.type === 'agent-started') {
      const tabId = sessionTabs.get(event.sessionId);
      if (tabId != null) runTabs.set(event.runId, tabId);
    }

    const payload: DaemonBackgroundEvent = { type: 'daemon-event', event };
    if (event.type !== 'agent-log') browser.runtime.sendMessage(payload).catch(() => {});

    const tabId = tabIdForEvent(event);
    if (tabId == null) {
      void broadcastToTabs(payload);
      return;
    }

    browser.tabs.sendMessage(tabId, payload).catch(() => {
      if ('runId' in event) runTabs.delete(event.runId);
      if ('sessionId' in event) sessionTabs.delete(event.sessionId);
    });
  }

  async function broadcastToTabs(event: DaemonBackgroundEvent): Promise<void> {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id != null) browser.tabs.sendMessage(tab.id, event).catch(() => {});
    }
  }

  function rememberSessionTab(sessionId: string, sender: MessageSender): void {
    const tabId = tabIdFrom(sender);
    if (tabId != null) sessionTabs.set(sessionId, tabId);
  }

  function tabIdForEvent(event: ServerEvent): number | undefined {
    if ('runId' in event) return runTabs.get(event.runId);
    if ('sessionId' in event) return sessionTabs.get(event.sessionId);
    return undefined;
  }

  function tabIdFrom(sender: MessageSender): number | undefined {
    return sender.tab?.id;
  }
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
