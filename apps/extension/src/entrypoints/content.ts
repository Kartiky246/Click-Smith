import { defineContentScript } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import type { CapturedElement, ServerEvent } from '@clicksmith/core';
import { captureElement } from '../lib/locator';
import type { BackgroundResponse, ContentToBackground, ExtensionState } from '../lib/messages';
import { mountOverlay, type Overlay, type OverlayAnchor } from '../lib/overlay';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',
  async main() {
    let state: ExtensionState = await send({ type: 'get-state' }).catch(() => ({
      aiMode: true,
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
        overlay.toast('Submitting request to agent...');
        try {
          const result = (await send({ type: 'submit', sessionId, prompt, execution })) as {
            runId: string;
          };
          overlay.startRun(result.runId);
        } catch (err) {
          overlay.toast(`Submit failed: ${errorMessage(err)}`);
        }
      },
    });

    overlay.setState(state);

    // Alt+Click capture. ClickSmith is always ready; there is no separate AI mode.
    document.addEventListener(
      'click',
      (ev) => {
        if (!ev.altKey) return;
        const target = ev.target as Element | null;
        if (!target || overlay.contains(target)) return;
        ev.preventDefault();
        ev.stopPropagation();
        void capture(target);
      },
      true,
    );

    async function capture(target: Element): Promise<void> {
      const anchor = anchorFrom(target);
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
        overlay.addMark(res.element, app.route, anchor);
      } catch (err) {
        overlay.toast(`Capture failed: ${errorMessage(err)}`);
      }
    }

    // React to daemon/run events pushed by the background worker.
    browser.runtime.onMessage.addListener(
      (msg: { type: string; event?: ServerEvent; state?: ExtensionState }) => {
        if (msg.type === 'state' && msg.state) {
          state = msg.state;
          overlay.setState(state);
        } else if (msg.type === 'daemon-event' && msg.event) {
          overlay.onDaemonEvent(msg.event);
        }
      },
    );
  },
});

async function send(message: ContentToBackground): Promise<unknown> {
  const res = (await browser.runtime.sendMessage(message)) as BackgroundResponse;
  if (!res?.ok) throw new Error(res?.error ?? 'background error');
  return res.result;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function anchorFrom(target: Element): OverlayAnchor {
  const rect = target.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
