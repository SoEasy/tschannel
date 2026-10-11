import { Bridge, NamespaceBuilder, type TInternalMessage, type TSerializer } from '@tschannel/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PubSubChannel } from '../src/index';

const namespace = new NamespaceBuilder('pubsub-handshake').mainToWorkerMessage<string, string>()('echo').build();

function createRecordingSerializer(messages: TInternalMessage[]): TSerializer {
  return {
    serialize(message) {
      messages.push(message);
      return JSON.stringify(message);
    },
    deserialize(data) {
      return JSON.parse(String(data)) as TInternalMessage;
    },
  };
}

describe('PubSubChannel handshake integration', () => {
  const cleanup: Array<{ destroy(): void }> = [];

  afterEach(() => {
    cleanup.splice(0).forEach((value) => value.destroy());
  });

  it('carries the symmetric handshake through a custom serializer', async () => {
    const eventBus = new EventTarget();
    const messages: TInternalMessage[] = [];
    const serializer = createRecordingSerializer(messages);
    const main = new Bridge(namespace, new PubSubChannel({ side: 'main', eventBus, serializer }));
    await Promise.resolve();
    const worker = new Bridge(namespace, new PubSubChannel({ side: 'worker', eventBus, serializer }));
    cleanup.push(main, worker);

    await Promise.all([main.ready(), worker.ready()]);

    expect(messages.some((message) => message.type === 'hello')).toBe(true);
    expect(messages.some((message) => message.type === 'select')).toBe(true);
    expect(messages.some((message) => message.type === 'connected')).toBe(true);
    expect(messages.some((message) => message.type === 'hello-response')).toBe(false);
  });

  it('selects one worker on a shared event bus', async () => {
    const eventBus = new EventTarget();
    const workerOne = new Bridge(namespace, new PubSubChannel({ side: 'worker', eventBus }), {
      handshake: { timeout: 100 },
    });
    const workerTwo = new Bridge(namespace, new PubSubChannel({ side: 'worker', eventBus }), {
      handshake: { timeout: 100 },
    });
    const main = new Bridge(namespace, new PubSubChannel({ side: 'main', eventBus }), {
      handshake: { timeout: 100 },
    });
    cleanup.push(main, workerOne, workerTwo);

    await main.ready();
    expect([workerOne, workerTwo].filter((worker) => worker.isReady())).toHaveLength(1);
  });

  it('ignores an application envelope from a foreign session', async () => {
    const eventBus = new EventTarget();
    const messages: TInternalMessage[] = [];
    const serializer = createRecordingSerializer(messages);
    const main = new Bridge(namespace, new PubSubChannel({ side: 'main', eventBus, serializer }));
    const worker = new Bridge(namespace, new PubSubChannel({ side: 'worker', eventBus, serializer }));
    cleanup.push(main, worker);
    const handler = vi.fn(async (value: string) => value);
    worker.listen(namespace.message.echo, handler);
    await Promise.all([main.ready(), worker.ready()]);
    const select = messages.find((message) => message.type === 'select');
    if (!select || select.type !== 'select') {
      throw new Error('Expected SELECT');
    }

    eventBus.dispatchEvent(
      new CustomEvent('bridge-message', {
        detail: JSON.stringify({
          family: 'application',
          type: 'request',
          id: 'foreign',
          namespace: namespace.namespaceName,
          name: 'echo',
          endpointId: select.endpointId,
          targetEndpointId: select.targetEndpointId,
          sender: 'main',
          sessionId: 'foreign-session',
          data: 'ignored',
        }),
      })
    );

    expect(handler).not.toHaveBeenCalled();
    await expect(main.dispatch(namespace.send.echo('accepted'))).resolves.toBe('accepted');
    expect(handler).toHaveBeenCalledOnce();
  });
});
