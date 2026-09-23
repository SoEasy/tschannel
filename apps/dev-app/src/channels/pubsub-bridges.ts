import { Bridge } from '@tschannel/core';
import { PubSubChannel } from '@tschannel/pubsub-channel';
import { demoNamespace, messages } from '../namespace';

// Create channels - they will automatically share the global EventTarget
const channelA = new PubSubChannel({ side: 'main' });
const channelB = new PubSubChannel({ side: 'worker' });

// Create bridges
export const bridgeA = new Bridge(demoNamespace, channelA);
export const bridgeB = new Bridge(demoNamespace, channelB);

// Setup message handlers for Bridge A (main side)
// Worker → Main handlers (A receives events from B)
bridgeA.listen(messages.notifyParent, async (message: string) => {
  console.log('[Bridge A] Notification from B:', message);
});

bridgeA.listen(messages.logToParent, async (log: { level: string; message: string }) => {
  console.log(`[Bridge A] Log from B [${log.level}]:`, log.message);
});

// Bidirectional handlers (A can receive)
bridgeA.listen(messages.ping, async () => {
  return 'pong from A';
});

bridgeA.listen(messages.echo, async (text: string) => {
  return `Bridge A echoes: ${text}`;
});

// Setup message handlers for Bridge B (worker side)
// Main → Worker handlers (B receives commands from A)
bridgeB.listen(messages.sendText, async (text: string) => {
  return `Echo: ${text}`;
});

bridgeB.listen(messages.calculateSquare, async (num: number) => {
  return num * num;
});

bridgeB.listen(messages.getUserData, async ({ id }: { id: string }) => {
  // Simulate user data fetch
  return {
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
  };
});

// Bidirectional handlers (B can also receive)
bridgeB.listen(messages.ping, async () => {
  return 'pong from B';
});

bridgeB.listen(messages.echo, async (text: string) => {
  return `Bridge B echoes: ${text}`;
});

// Cleanup function
export const cleanup = () => {
  channelA.destroy();
  channelB.destroy();
};
