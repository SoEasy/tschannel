import { describe, expect, it } from 'vitest';
import { MiddlewarePipeline } from '../../src/bridge/middleware';
import { ProtocolSession } from '../../src/bridge/session';
import type { THandshakeMessage } from '../../src/types';

function createPair(dropFirstConnected = false): {
  main: ProtocolSession;
  worker: ProtocolSession;
  sent: THandshakeMessage[];
} {
  const sent: THandshakeMessage[] = [];
  let main: ProtocolSession;
  let worker: ProtocolSession;
  let dropped = false;
  main = new ProtocolSession({
    namespace: 'test',
    side: 'main',
    handshake: { timeout: 100, retryInterval: 5 },
    isChannelReady: () => true,
    send: (message) => {
      sent.push(message);
      worker.accept(message);
    },
    middleware: new MiddlewarePipeline('test', 'main'),
  });
  worker = new ProtocolSession({
    namespace: 'test',
    side: 'worker',
    handshake: { timeout: 100, retryInterval: 5 },
    isChannelReady: () => true,
    send: (message) => {
      sent.push(message);
      if (dropFirstConnected && message.type === 'connected' && !dropped) {
        dropped = true;
        return;
      }
      main.accept(message);
    },
    middleware: new MiddlewarePipeline('test', 'worker'),
  });
  return { main, worker, sent };
}

describe('ProtocolSession', () => {
  it('negotiates one session and admits only frames from its selected peer', async () => {
    const { main, worker, sent } = createPair();
    main.start();
    worker.start();
    await Promise.all([main.ready(), worker.ready()]);

    expect(sent.map((message) => message.type)).toEqual(['hello', 'hello', 'select', 'connected']);
    const snapshot = main.current();
    expect(snapshot).not.toBeNull();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(worker.current()?.sessionId).toBe(snapshot?.sessionId);
    const valid = {
      family: 'application' as const,
      type: 'request' as const,
      id: 'request-1',
      name: 'ping',
      namespace: 'test',
      endpointId: snapshot?.peerEndpointId ?? '',
      targetEndpointId: snapshot?.endpointId ?? '',
      sessionId: snapshot?.sessionId ?? '',
      sender: 'worker' as const,
      data: 'hello',
    };
    expect(main.admits(valid)).toBe(true);
    expect(main.admits({ ...valid, sessionId: 'foreign' })).toBe(false);
    expect(main.admits({ ...valid, endpointId: 'other' })).toBe(false);
    main.destroy(new Error('destroyed'));
    worker.destroy(new Error('destroyed'));
  });

  it('retries the selected session when the first confirmation is lost', async () => {
    const { main, worker, sent } = createPair(true);
    main.start();
    worker.start();
    await Promise.all([main.ready(), worker.ready()]);

    const selections = sent.filter((message) => message.type === 'select');
    expect(selections).toHaveLength(2);
    expect(selections[0]).toEqual(selections[1]);
    expect(sent.filter((message) => message.type === 'connected')).toHaveLength(2);
    main.destroy(new Error('destroyed'));
    worker.destroy(new Error('destroyed'));
  });

  it('times out without a peer and stays inert when destroyed before start', async () => {
    const sent: THandshakeMessage[] = [];
    const timedOut = new ProtocolSession({
      namespace: 'test',
      side: 'main',
      handshake: { timeout: 10, retryInterval: 2 },
      isChannelReady: () => true,
      send: (message) => sent.push(message),
      middleware: new MiddlewarePipeline('test', 'main'),
    });
    timedOut.start();
    await expect(timedOut.ready()).rejects.toThrow('Bridge handshake timeout');
    expect(sent.map((message) => message.type)).toEqual(['hello']);
    timedOut.destroy(new Error('destroyed'));

    const neverStarted = new ProtocolSession({
      namespace: 'test',
      side: 'worker',
      handshake: { timeout: 10, retryInterval: 2 },
      isChannelReady: () => true,
      send: (message) => sent.push(message),
      middleware: new MiddlewarePipeline('test', 'worker'),
    });
    neverStarted.destroy(new Error('destroyed'));
    neverStarted.start();
    await expect(neverStarted.ready()).rejects.toThrow('Bridge instance destroyed');
    expect(sent).toHaveLength(1);
  });
});
