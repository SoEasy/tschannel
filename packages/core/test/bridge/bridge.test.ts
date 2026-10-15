import { describe, expect, it } from 'vitest';
import { NamespaceBuilder } from '../../src/builder';
import { Bridge } from '../../src/bridge/bridge';
import type { IChannel } from '../../src/channel';
import type { TBridgeSide, TInternalMessage } from '../../src/types';

class LinkedChannel<TSide extends TBridgeSide> implements IChannel<TSide> {
  private receiver: ((message: TInternalMessage) => void) | undefined;
  private ready = false;
  peer?: LinkedChannel<TBridgeSide>;
  destroyed = 0;
  registeredBeforeInitialize = false;

  constructor(readonly side: TSide) {}

  initialize(): void {
    this.registeredBeforeInitialize = this.receiver !== undefined;
    this.ready = true;
  }

  send(message: TInternalMessage): void {
    queueMicrotask(() => this.peer?.receiver?.(message));
  }

  onMessage(receiver: (message: TInternalMessage) => void): void {
    this.receiver = receiver;
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.ready = false;
    this.receiver = undefined;
    this.destroyed += 1;
  }

  deliver(message: TInternalMessage): void {
    this.receiver?.(message);
  }
}

const namespace = new NamespaceBuilder('facade').mainToWorkerMessage<string, string>()('ping').build();

describe('Bridge facade', () => {
  it('registers ingress before channel startup and delegates request handling', async () => {
    const mainChannel = new LinkedChannel('main');
    const workerChannel = new LinkedChannel('worker');
    mainChannel.peer = workerChannel;
    workerChannel.peer = mainChannel;
    const main = new Bridge(namespace, mainChannel);
    const worker = new Bridge(namespace, workerChannel);
    try {
      await Promise.all([main.ready(), worker.ready()]);
      expect(mainChannel.registeredBeforeInitialize).toBe(true);
      expect(workerChannel.registeredBeforeInitialize).toBe(true);
      expect(main.isReady()).toBe(true);
      worker.listen(namespace.message.ping, (value) => `${value}-reply`);
      await expect(main.dispatch(namespace.send.ping('hello'))).resolves.toBe('hello-reply');
    } finally {
      main.destroy();
      worker.destroy();
    }
    expect(mainChannel.destroyed).toBe(1);
    expect(workerChannel.destroyed).toBe(1);
  });

  it('ignores malformed ingress and destroys the channel only once', async () => {
    const channel = new LinkedChannel('main');
    const bridge = new Bridge(namespace, channel, { handshake: { timeout: 20, retryInterval: 2 } });
    channel.deliver({ family: 'control', type: 'hello', namespace: 'facade' } as TInternalMessage);
    await Promise.resolve();
    bridge.destroy();
    bridge.destroy();
    await expect(bridge.ready()).rejects.toThrow(Bridge.ERRORS.BRIDGE_DESTROYED);
    expect(channel.destroyed).toBe(1);
  });
});
