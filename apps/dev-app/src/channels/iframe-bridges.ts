import { Bridge, IChannel } from '@tschannel/core';
import { IframeChannel } from '@tschannel/iframe-channel';
import { demoNamespace, messages } from '../namespace';
import type { LogService } from '../middlewares/log/log.service';

// Single channel instance for parent side
let parentChannel: IframeChannel<'main'> | null = null;
let parentBridge: Bridge<typeof demoNamespace, IChannel<'main'>> | null = null;

// Single channel instance for child side
let childChannel: IframeChannel<'worker'> | null = null;
let childBridge: Bridge<typeof demoNamespace, IChannel<'worker'>> | null = null;

// LogService for logging (set from UI)
let logService: LogService | null = null;

export const setLogService = (service: LogService | null) => {
  logService = service;
};

/**
 * Initialize parent bridge (main side)
 * @param iframe - The iframe element to communicate with
 */
export const initParentBridge = (iframe: HTMLIFrameElement) => {
  parentChannel = new IframeChannel({
    side: 'main',
    iframe: iframe,
    targetOrigin: '*', // In production, use specific origin!
    expectedOrigin: window.location.origin,
  });

  parentBridge = new Bridge<typeof demoNamespace, typeof parentChannel>(
    demoNamespace,
    parentChannel
  );

  // Setup handlers for Worker → Main messages (parent receives events from iframe)
  parentBridge.listen(messages.notifyParent, async (message) => {
    logService?.addMessage({ side: 'Worker', type: 'sent', message: `notifyParent: "${message}"` });
    console.log('[Parent] Notification from iframe:', message);
  });

  parentBridge.listen(messages.logToParent, async (log: { level: string; message: string }) => {
    logService?.addMessage({
      side: 'Worker',
      type: 'sent',
      message: `logToParent [${log.level}]: "${log.message}"`,
    });
    console.log(`[Parent] Log from iframe [${log.level}]:`, log.message);
  });

  // Bidirectional handlers (parent can also receive)
  parentBridge.listen(messages.ping, async () => {
    logService?.addMessage({ side: 'Worker', type: 'sent', message: 'ping from Worker' });
    const response = 'pong from parent';
    logService?.addMessage({ side: 'Main', type: 'sent', message: response });
    return response;
  });

  parentBridge.listen(messages.echo, async (text: string) => {
    logService?.addMessage({
      side: 'Worker',
      type: 'sent',
      message: `echo from Worker: "${text}"`,
    });
    const response = `Parent echoes: ${text}`;
    logService?.addMessage({ side: 'Main', type: 'sent', message: response });
    return response;
  });

  return parentBridge;
};

/**
 * Initialize child bridge (worker side) - called from within iframe
 */
export const initChildBridge = () => {
  childChannel = new IframeChannel({
    side: 'worker',
    targetOrigin: '*', // In production, use specific origin!
    expectedOrigin: window.location.origin,
  });

  childBridge = new Bridge(demoNamespace, childChannel);

  // Setup message handlers for child bridge
  // Main → Worker handlers (iframe receives commands from parent)
  childBridge.listen(messages.sendText, async (text: string) => {
    return `Echo from iframe: ${text}`;
  });

  childBridge.listen(messages.calculateSquare, async (num: number) => {
    return num * num;
  });

  childBridge.listen(messages.getUserData, async ({ id }: { id: string }) => {
    // Simulate user data fetch
    return {
      id,
      name: `User ${id} (from iframe)`,
      email: `user${id}@iframe.example.com`,
    };
  });

  // Bidirectional handlers (iframe can receive from either side)
  childBridge.listen(messages.ping, async () => {
    return 'pong from iframe';
  });

  childBridge.listen(messages.echo, async (text: string) => {
    return `Iframe echoes: ${text}`;
  });

  return childBridge;
};

// Cleanup function
export const cleanup = () => {
  parentChannel?.destroy();
  childChannel?.destroy();
  parentBridge = null;
  childBridge = null;
  parentChannel = null;
  childChannel = null;
};
