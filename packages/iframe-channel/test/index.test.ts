import { Bridge, NamespaceBuilder, type TInternalMessage, type TSerializer } from '@tschannel/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IframeChannel } from '../src/index';

const namespace = new NamespaceBuilder('iframe-handshake').build();

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

describe('IframeChannel handshake integration', () => {
  const cleanup: Array<{ destroy(): void }> = [];

  afterEach(() => {
    cleanup.splice(0).forEach((value) => value.destroy());
  });

  it('registers a receiver before initialize and transports the full handshake', async () => {
    const messages: TInternalMessage[] = [];
    const serializer = createRecordingSerializer(messages);
    const iframe = { contentWindow: window } as unknown as HTMLIFrameElement;
    const mainChannel = new IframeChannel({
      side: 'main',
      iframe,
      serializer,
      silent: true,
    });
    const workerChannel = new IframeChannel({
      side: 'worker',
      serializer,
      silent: true,
    });
    const mainOnMessage = vi.spyOn(mainChannel, 'onMessage');
    const mainInitialize = vi.spyOn(mainChannel, 'initialize');
    const main = new Bridge(namespace, mainChannel, {
      handshake: { timeout: 500, retryInterval: 20 },
    });
    const worker = new Bridge(namespace, workerChannel, {
      handshake: { timeout: 500, retryInterval: 20 },
    });
    cleanup.push(main, worker);

    await Promise.all([main.ready(), worker.ready()]);

    expect(mainOnMessage.mock.invocationCallOrder[0]).toBeLessThan(mainInitialize.mock.invocationCallOrder[0]);
    expect(messages.some((message) => message.type === 'hello')).toBe(true);
    expect(messages.some((message) => message.type === 'select')).toBe(true);
    expect(messages.some((message) => message.type === 'connected')).toBe(true);
  });

  it('preserves expected-origin validation for control envelopes', () => {
    const iframe = { contentWindow: window } as unknown as HTMLIFrameElement;
    const channel = new IframeChannel({
      side: 'main',
      iframe,
      expectedOrigin: 'https://trusted.example',
      silent: true,
    });
    const handler = vi.fn();
    channel.onMessage(handler);
    channel.initialize();
    cleanup.push(channel);
    const hello: TInternalMessage = {
      family: 'control',
      type: 'hello',
      protocolVersion: 1,
      namespace: namespace.namespaceName,
      endpointId: 'worker',
      sender: 'worker',
    };

    window.dispatchEvent(new MessageEvent('message', { data: hello, origin: 'https://untrusted.example' }));
    expect(handler).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent('message', { data: hello, origin: 'https://trusted.example' }));
    expect(handler).toHaveBeenCalledWith(hello);
  });
});
