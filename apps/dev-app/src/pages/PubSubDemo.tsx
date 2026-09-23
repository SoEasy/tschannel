import { Component, onCleanup, onMount } from 'solid-js';
import DemoControls from '../components/DemoControls';
import Log from '../components/Log';
import { bridgeA, bridgeB, cleanup } from '../channels/pubsub-bridges';
import { LogService } from '../middlewares/log/log.service';
import { messages } from '../namespace';

const PubSubDemo: Component = () => {
  const logService = new LogService();

  onMount(() => {
    // Setup listeners for Worker → Main messages to log them
    bridgeA.listen(messages.notifyParent, async (message: string) => {
      logService.addMessage({ side: 'Worker', type: 'sent', message: `notifyParent: "${message}"` });
      console.log('[Bridge A] Notification from B:', message);
    });

    bridgeA.listen(messages.logToParent, async (log: { level: string; message: string }) => {
      logService.addMessage({
        side: 'Worker',
        type: 'sent',
        message: `logToParent [${log.level}]: "${log.message}"`,
      });
      console.log(`[Bridge A] Log from B [${log.level}]:`, log.message);
    });

    // Setup listeners for Bidirectional messages from Worker
    bridgeA.listen(messages.ping, async () => {
      logService.addMessage({ side: 'Worker', type: 'sent', message: 'ping from Worker' });
      const response = 'pong from Main';
      logService.addMessage({ side: 'Main', type: 'sent', message: response });
      return response;
    });

    bridgeA.listen(messages.echo, async (text: string) => {
      logService.addMessage({ side: 'Worker', type: 'sent', message: `echo from Worker: "${text}"` });
      const response = `Main echoes: ${text}`;
      logService.addMessage({ side: 'Main', type: 'sent', message: response });
      return response;
    });
  });

  onCleanup(() => {
    cleanup();
    logService.destroy();
  });

  return (
    <>
      <DemoControls bridge={bridgeA} bridgeB={bridgeB} channelName="PubSubChannel" logService={logService} />
      <Log logService={logService} />
    </>
  );
};

export default PubSubDemo;
