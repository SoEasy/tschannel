import { initChildBridge } from './channels/iframe-bridges';
import { messages, send } from './namespace';

// Initialize child bridge when script loads
try {
  const bridge = initChildBridge();

  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = 'Status: Bridge ready! Listening for messages from parent.';
    statusEl.classList.add('ready');
  }

  // Worker → Main button handlers
  const notifyBtn = document.getElementById('notifyBtn');
  if (notifyBtn) {
    notifyBtn.addEventListener('click', async () => {
      try {
        await bridge.dispatch(
          send.notifyParent(`Important event at ${new Date().toLocaleTimeString()}`)
        );
        console.log('[Iframe] Sent notification to parent');
      } catch (error) {
        console.error('[Iframe] Failed to send notification:', error);
      }
    });
  }

  const logBtn = document.getElementById('logBtn');
  if (logBtn) {
    logBtn.addEventListener('click', async () => {
      try {
        await bridge.dispatch(
          send.logToParent({
            level: 'info',
            message: `Iframe event at ${new Date().toLocaleTimeString()}`,
          })
        );
        console.log('[Iframe] Sent log to parent');
      } catch (error) {
        console.error('[Iframe] Failed to send log:', error);
      }
    });
  }

  // Bidirectional button handlers
  const pingBtn = document.getElementById('pingBtn');
  if (pingBtn) {
    pingBtn.addEventListener('click', async () => {
      try {
        const response = await bridge.dispatch(send.ping());
        console.log('[Iframe] Ping response from parent:', response);
        alert(`Parent responded: ${response}`);
      } catch (error) {
        console.error('[Iframe] Failed to ping:', error);
      }
    });
  }

  const echoBtn = document.getElementById('echoBtn');
  if (echoBtn) {
    echoBtn.addEventListener('click', async () => {
      try {
        const response = await bridge.dispatch(send.echo('Hello from iframe!'));
        console.log('[Iframe] Echo response from parent:', response);
        alert(`Parent responded: ${response}`);
      } catch (error) {
        console.error('[Iframe] Failed to echo:', error);
      }
    });
  }

  console.log('[Iframe Child] Bridge initialized and ready');
} catch (error) {
  console.error('[Iframe Child] Failed to initialize bridge:', error);

  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = `Status: Error - ${error}`;
  }
}
