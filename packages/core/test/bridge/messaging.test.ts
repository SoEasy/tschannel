import { describe, expect, it } from 'vitest';
import { NamespaceBuilder } from '../../src/builder';
import type { IProtocolSession, TSessionSnapshot } from '../../src/bridge/contracts';
import { Messaging } from '../../src/bridge/messaging';
import { MiddlewarePipeline } from '../../src/bridge/middleware';
import type { TApplicationMessage } from '../../src/types';

const namespace = new NamespaceBuilder('messaging').mainToWorkerMessage<string, string>()('ping').build();

function readySession(side: 'main' | 'worker'): IProtocolSession {
  const snapshot: TSessionSnapshot = {
    endpointId: side === 'main' ? 'main' : 'worker',
    peerEndpointId: side === 'main' ? 'worker' : 'main',
    sessionId: 'session-1',
    namespace: 'messaging',
    side,
  };
  return {
    localEndpointId: () => snapshot.endpointId,
    start: () => undefined,
    accept: () => undefined,
    admits: () => true,
    current: () => snapshot,
    ready: () => Promise.resolve(),
    isReady: () => true,
    hasReadinessFailed: () => false,
    fail: () => undefined,
    destroy: () => undefined,
  };
}

describe('Messaging', () => {
  it('registers a pending request before a synchronous response arrives', async () => {
    const middleware = new MiddlewarePipeline('messaging', 'main');
    let messaging: Messaging<typeof namespace>;
    messaging = new Messaging(namespace, {
      side: 'main',
      timeout: 50,
      session: readySession('main'),
      middleware,
      send: (message) => {
        messaging.accept({
          ...message,
          type: 'response',
          endpointId: 'worker',
          targetEndpointId: 'main',
          data: 'pong',
        });
      },
    });

    const response: Promise<string> = messaging.dispatch(namespace.send.ping('hello'));
    await expect(response).resolves.toBe('pong');
    messaging.destroy(new Error('destroyed'));
  });

  it('settles concurrent requests by id and propagates remote errors', async () => {
    const sent: TApplicationMessage[] = [];
    const messaging = new Messaging(namespace, {
      side: 'main',
      timeout: 50,
      session: readySession('main'),
      middleware: new MiddlewarePipeline('messaging', 'main'),
      send: (message) => sent.push(message),
    });
    const first = messaging.dispatch(namespace.send.ping('first'));
    const second = messaging.dispatch(namespace.send.ping('second'));
    const firstResult = expect(first).rejects.toThrow('remote failure');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toHaveLength(2);
    messaging.accept({
      ...sent[1],
      type: 'response',
      endpointId: 'worker',
      targetEndpointId: 'main',
      data: 'second-response',
    });
    messaging.accept({
      ...sent[0],
      type: 'error',
      endpointId: 'worker',
      targetEndpointId: 'main',
      error: 'remote failure',
    });
    await expect(second).resolves.toBe('second-response');
    await firstResult;
    messaging.destroy(new Error('destroyed'));
  });

  it('invokes a listener and sends an error when no listener is registered', async () => {
    const frames: TApplicationMessage[] = [];
    const messaging = new Messaging(namespace, {
      side: 'worker',
      timeout: 50,
      session: readySession('worker'),
      middleware: new MiddlewarePipeline('messaging', 'worker'),
      send: (message) => frames.push(message),
    });
    const request: TApplicationMessage = {
      family: 'application',
      type: 'request',
      id: 'request-1',
      name: 'ping',
      namespace: 'messaging',
      endpointId: 'main',
      targetEndpointId: 'worker',
      sessionId: 'session-1',
      sender: 'main',
      data: 'hello',
    };
    const unsubscribe = messaging.listen(namespace.message.ping, (value) => `${value}-handled`);
    messaging.accept(request);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(frames[0]).toEqual(expect.objectContaining({ type: 'response', data: 'hello-handled' }));

    unsubscribe();
    messaging.accept({ ...request, id: 'request-2' });
    expect(frames[1]).toEqual(expect.objectContaining({ type: 'error', error: 'No handler for message: ping' }));
    messaging.destroy(new Error('destroyed'));
  });

  it('times out unanswered requests and aborts pending middleware on destruction', async () => {
    const middleware = new MiddlewarePipeline('messaging', 'main');
    const messaging = new Messaging(namespace, {
      side: 'main',
      timeout: 10,
      session: readySession('main'),
      middleware,
      send: () => undefined,
    });
    await expect(messaging.dispatch(namespace.send.ping('unanswered'))).rejects.toThrow('Message timeout: ping');

    let release: (value: unknown) => void = () => undefined;
    middleware.use({
      onBeforeSend: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = messaging.dispatch(namespace.send.ping('pending'));
    await Promise.resolve();
    messaging.destroy(new Error('Bridge instance destroyed'));
    release('late');
    await expect(pending).rejects.toThrow('Bridge instance destroyed');
  });
});
