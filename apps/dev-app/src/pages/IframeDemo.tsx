import { Component, createSignal, onMount, onCleanup, Show } from 'solid-js';
import DemoControls from '../components/DemoControls';
import Log from '../components/Log';
import { initParentBridge, cleanup, setLogService } from '../channels/iframe-bridges';
import type { Bridge, IChannel } from '@tschannel/core';
import type { demoNamespace } from '../namespace';
import { LogService } from '../middlewares/log/log.service';

const IframeDemo: Component = () => {
  const [bridge, setBridge] = createSignal<Bridge<typeof demoNamespace, IChannel<'main'>> | null>(null);
  const logService = new LogService();
  let iframeRef: HTMLIFrameElement | undefined;

  onMount(() => {
    // Set LogService for iframe-bridges handlers
    setLogService(logService);

    // Wait for iframe to load
    const timer = setTimeout(() => {
      if (iframeRef) {
        try {
          const parentBridge = initParentBridge(iframeRef);
          setBridge(parentBridge);
        } catch (error) {
          console.error('Failed to initialize parent bridge:', error);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  });

  onCleanup(() => {
    cleanup();
    setLogService(null);
    logService.destroy();
  });

  return (
    <>
      <div class="iframe-container">
        <div class="iframe-info">
          <h3>Iframe Communication</h3>
          <p>
            Parent window communicates with iframe below using <code>postMessage</code> API. The
            iframe contains the "worker" side that handles requests.
          </p>
        </div>
        <iframe
          ref={iframeRef}
          src="/iframe.html"
          class="demo-iframe"
          title="Bridge-Kit Iframe Demo"
        />
      </div>

      <Show when={bridge()} fallback={<div class="loading">Initializing iframe bridge...</div>}>
        {(b) => (
          <>
            <DemoControls bridge={b()} channelName="IframeChannel" logService={logService} />
            <Log logService={logService} />
          </>
        )}
      </Show>
    </>
  );
};

export default IframeDemo;
