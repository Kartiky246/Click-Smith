import { defineContentScript } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import type { CapturedElement, CapturedElementInput, ServerEvent } from '@clicksmith/core';
import { captureElement } from '../lib/locator';
import type { AppRef, BackgroundResponse, ContentToBackground, ExtensionState } from '../lib/messages';
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

    // Local element buffer — no HTTP round-trip on Alt+Click.
    // A single POST /run is sent only when the user clicks Submit.
    let elementBuffer: { id: number; input: CapturedElementInput }[] = [];
    let capturedApp: AppRef | null = null;
    let nextLocalId = 1;

    const overlay: Overlay = mountOverlay({
      onRemove: (id) => {
        elementBuffer = elementBuffer.filter((e) => e.id !== id);
        overlay.removeMark(id);
      },
      onSubmit: async (prompt, execution) => {
        if (!capturedApp || elementBuffer.length === 0) return;
        overlay.toast('Submitting request to agent...');
        try {
          const result = (await send({
            type: 'run',
            app: capturedApp,
            elements: elementBuffer.map((e) => e.input),
            prompt,
            execution,
          })) as { runId: string };
          overlay.startRun(result.runId);
        } catch (err) {
          overlay.toast(`Submit failed: ${errorMessage(err)}`);
        }
      },
    });

    overlay.setState(state);

    // Alt+Click capture — immediate, no network call.
    document.addEventListener(
      'click',
      (ev) => {
        if (!ev.altKey) return;
        const target = ev.target as Element | null;
        if (!target || overlay.contains(target)) return;
        ev.preventDefault();
        ev.stopPropagation();
        captureLocal(target);
      },
      true,
    );

    function captureLocal(target: Element): void {
      const anchor = anchorFrom(target);
      const input = captureElement(target);
      const app: AppRef = {
        url: location.href,
        route: location.pathname || '/',
        page: document.title || undefined,
      };

      if (!capturedApp) capturedApp = app;

      const id = nextLocalId++;
      elementBuffer.push({ id, input });

      const fullElement: CapturedElement = { id, ...input };
      overlay.addMark(fullElement, app.route, anchor);
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
