import { defineContentScript } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import { confirmationReasons, type CapturedElement, type ExecutionOptions, type ServerEvent } from '@clicksmith/core';
import { captureElement } from '../lib/locator';
import type { BackgroundResponse, ContentToBackground, ExtensionState } from '../lib/messages';
import { mountOverlay, type Overlay } from '../lib/overlay';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main() {
    let state: ExtensionState = await send({ type: 'get-state' }).catch(() => ({
      aiMode: false,
      agentId: null,
      daemonConnected: false,
    }));

    let sessionId: string | undefined;
    const overlay: Overlay = mountOverlay({
      onRemove: async (id) => {
        if (!sessionId) return;
        await send({ type: 'remove-element', sessionId, elementId: id });
        overlay.removeMark(id);
      },
      onSubmit: async (prompt, execution) => {
        if (!sessionId) return;
        const reasons = confirmationReasons(execution as ExecutionOptions);
        if (reasons.length && !window.confirm(`Confirm risky options?\n\n- ${reasons.join('\n- ')}`)) {
          return;
        }
        const result = (await send({ type: 'submit', sessionId, prompt, execution })) as {
          runId: string;
        };
        overlay.startRun(result.runId);
      },
      onApply: async (runId) => {
        await send({ type: 'apply', runId });
      },
    });

    overlay.setState(state);

    // Alt+Click capture, only while AI Mode is enabled.
    document.addEventListener(
      'click',
      (ev) => {
        if (!state.aiMode || !ev.altKey) return;
        const target = ev.target as Element | null;
        if (!target || overlay.contains(target)) return;
        ev.preventDefault();
        ev.stopPropagation();
        void capture(target);
      },
      true,
    );

    async function capture(target: Element): Promise<void> {
      const element = captureElement(target);
      const app = {
        url: location.href,
        route: location.pathname || '/',
        page: document.title || undefined,
      };
      try {
        const res = (await send({
          type: 'capture',
          app,
          element,
          ...(sessionId ? { sessionId } : {}),
        })) as { sessionId: string; element: CapturedElement };
        sessionId = res.sessionId;
        overlay.addMark(res.element, app.route);
      } catch (err) {
        overlay.toast(`Capture failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // React to daemon/run events pushed by the background worker.
    browser.runtime.onMessage.addListener((msg: { type: string; event?: ServerEvent; state?: ExtensionState }) => {
      if (msg.type === 'state' && msg.state) {
        state = msg.state;
        overlay.setState(state);
      } else if (msg.type === 'daemon-event' && msg.event) {
        overlay.onDaemonEvent(msg.event);
      }
    });
  },
});

async function send(message: ContentToBackground): Promise<unknown> {
  const res = (await browser.runtime.sendMessage(message)) as BackgroundResponse;
  if (!res?.ok) throw new Error(res?.error ?? 'background error');
  return res.result;
}
