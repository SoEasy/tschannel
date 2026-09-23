import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bridge } from './../src/bridge';
import { NamespaceBuilder } from './../src/builder';
import type { IChannel } from './../src/channel';
import { TBridgeSide, TInternalMessage } from './../src/types';

// Test Channel implementation using simple pub-sub pattern
class TestChannel<TSide extends TBridgeSide> implements IChannel<TSide> {
  private handlers: Array<(message: TInternalMessage) => void> = [];
  private ready = false;
  public readonly side: TSide;

  constructor(
    private config: { side: TSide },
    private peerChannel?: TestChannel<TSide extends 'main' ? 'worker' : 'main'>
  ) {
    this.side = config.side;
  }

  initialize(): void {
    this.ready = true;
  }

  send(message: TInternalMessage): void {
    if (!this.ready) {
      throw new Error('Channel is not ready');
    }

    // Send to peer channel if available
    if (this.peerChannel) {
      // Simulate async delivery
      queueMicrotask(() => {
        this.peerChannel!.deliverMessage(message);
      });
    }
  }

  onMessage(handler: (message: TInternalMessage) => void): void {
    this.handlers.push(handler);
  }

  isReady(): boolean {
    return this.ready;
  }

  getSide(): TSide {
    return this.config.side;
  }

  destroy(): void {
    this.ready = false;
    this.handlers = [];
  }

  // Internal method to deliver message to handlers
  private deliverMessage(message: TInternalMessage): void {
    this.handlers.forEach((handler) => handler(message));
  }

  // Helper to connect two channels for bidirectional communication
  static createPair(): [TestChannel<'main'>, TestChannel<'worker'>] {
    const mainChannel = new TestChannel<'main'>({ side: 'main' });
    const workerChannel = new TestChannel<'worker'>({ side: 'worker' });

    // Connect channels to each other
    mainChannel.peerChannel = workerChannel;
    workerChannel.peerChannel = mainChannel;

    return [mainChannel, workerChannel];
  }
}

// Test namespace
type TTestRequest = { value: number };
type TTestResponse = { result: number };

const testNamespace = new NamespaceBuilder('test')
  .workerToMainMessage<TTestRequest, TTestResponse>()('calculate')
  .mainToWorkerMessage<void, string>()('ping')
  .bidirectionalMessage<string, void>()('notify')
  .build();

describe('Bridge security mechanisms', () => {
  let channel: TestChannel<'main'>;
  let bridge: Bridge<typeof testNamespace, typeof channel>;

  beforeEach(() => {
    channel = new TestChannel({ side: 'main' });
    bridge = new Bridge(testNamespace, channel);
  });

  it('creates bridge instance', () => {
    expect(bridge).toBeDefined();
    expect(bridge.isReady()).toBe(true);
  });

  it('rejects dispatch when channel is not ready', async () => {
    bridge.destroy();

    const pingMessage = testNamespace.send.ping();
    await expect(bridge.dispatch(pingMessage)).rejects.toThrow(Bridge.ERRORS.CHANNEL_NOT_READY);
  });

  it('rejects dispatch when namespace mismatch', async () => {
    const wrongMessage = {
      namespace: 'wrong',
      name: 'test',
      payload: {},
      meta: {
        direction: 'mainToWorker',
        type: 'forSend',
      },
    };

    // @ts-expect-error - Testing runtime validation
    await expect(bridge.dispatch(wrongMessage)).rejects.toThrow(
      Bridge.ERRORS.NAMESPACE_MISMATCH('wrong', 'test')
    );
  });

  it('times out when no response received', async () => {
    const message = testNamespace.send.ping(undefined);
    const bridgeWithShortTimeout = new Bridge<typeof testNamespace, typeof channel>(
      testNamespace,
      channel,
      {
        timeout: 100,
      }
    );

    await expect(bridgeWithShortTimeout.dispatch(message)).rejects.toThrow(
      Bridge.ERRORS.TIMEOUT('ping')
    );
  });

  it('registers message handler', () => {
    const unsubscribe = bridge.listen(testNamespace.message.calculate, async (payload) => {
      return { result: payload.value * 2 };
    });

    expect(typeof unsubscribe).toBe('function');
  });

  it('throws when namespace mismatch in listen', () => {
    const wrongMessage = {
      namespace: 'wrong',
      name: 'test',
      meta: {
        direction: 'mainToWorker',
        type: 'forListen',
      },
    };

    expect(() => {
      // @ts-expect-error - Testing runtime validation
      bridge.listen(wrongMessage, async () => ({ result: 0 }));
    }).toThrow(Bridge.ERRORS.NAMESPACE_MISMATCH('wrong', 'test'));
  });

  it('rejects dispatch when message has wrong meta type (forListen instead of forSend)', async () => {
    const wrongMessage = {
      namespace: 'test',
      name: 'ping',
      payload: undefined,
      meta: {
        direction: 'mainToWorker',
        type: 'forListen', // Wrong type!
      },
    };

    // @ts-expect-error - Testing runtime validation
    await expect(bridge.dispatch(wrongMessage)).rejects.toThrow(
      Bridge.ERRORS.INVALID_MESSAGE_TYPE('forListen', '.send.%message%')
    );
  });

  it('rejects dispatch when message has no meta field', async () => {
    const invalidMessage = {
      namespace: 'test',
      name: 'ping',
      payload: undefined,
      // meta field is missing
    };

    // @ts-expect-error - Testing runtime validation
    await expect(bridge.dispatch(invalidMessage)).rejects.toThrow(
      Bridge.ERRORS.INVALID_MESSAGE_INSTANCE
    );
  });

  it('throws when listen receives message with wrong meta type (forSend instead of forListen)', () => {
    const wrongMessage = {
      namespace: 'test',
      name: 'calculate',
      meta: {
        direction: 'workerToMain',
        type: 'forSend', // Wrong type!
      },
    };

    expect(() => {
      // @ts-expect-error - Testing runtime validation
      bridge.listen(wrongMessage, async () => ({ result: 0 }));
    }).toThrow(Bridge.ERRORS.INVALID_MESSAGE_TYPE('forSend', '.message.%message%'));
  });

  it('throws when listen receives message with no meta field', () => {
    const invalidMessage = {
      namespace: 'test',
      name: 'calculate',
      // meta field is missing
    };

    expect(() => {
      // @ts-expect-error - Testing runtime validation
      bridge.listen(invalidMessage, async () => ({ result: 0 }));
    }).toThrow(Bridge.ERRORS.INVALID_MESSAGE_INSTANCE);
  });

  it('unregisters handler when unsubscribe is called', () => {
    const mockHandler = vi.fn(async (payload: TTestRequest) => ({ result: payload.value }));
    const unsubscribe = bridge.listen(testNamespace.message.calculate, mockHandler);

    unsubscribe();
    // After unsubscribe, handler should not be called
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('cleans up on destroy', () => {
    expect(bridge.isReady()).toBe(true);
    bridge.destroy();
    expect(bridge.isReady()).toBe(false);
  });
});

describe('Communication', () => {
  let bridgeMain: Bridge<typeof testNamespace, TestChannel<'main'>>;
  let bridgeWorker: Bridge<typeof testNamespace, TestChannel<'worker'>>;

  beforeEach(() => {
    const [channelMain, channelWorker] = TestChannel.createPair();

    bridgeMain = new Bridge(testNamespace, channelMain);
    bridgeWorker = new Bridge(testNamespace, channelWorker);
  });

  describe('Message delivery', () => {
    it('delivers messages with object payload correctly', async () => {
      bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
        return { result: payload.value * 2 };
      });

      const message = testNamespace.send.calculate({ value: 5 });
      const response = await bridgeWorker.dispatch(message);

      expect(response).toEqual({ result: 10 });
    });

    it('delivers messages with void request and string response', async () => {
      bridgeWorker.listen(testNamespace.message.ping, async () => {
        return 'pong';
      });

      const message = testNamespace.send.ping(undefined);
      const response = await bridgeMain.dispatch(message);

      expect(response).toBe('pong');
    });

    it('delivers messages with string request and void response', async () => {
      const receivedMessages: string[] = [];

      bridgeWorker.listen(testNamespace.message.notify, async (payload: string) => {
        receivedMessages.push(payload);
      });

      const message = testNamespace.send.notify('test notification');
      await bridgeMain.dispatch(message);

      expect(receivedMessages).toContain('test notification');
    });
  });

  describe('mainToWorker direction', () => {
    it('successfully sends mainToWorker message from main bridge', async () => {
      bridgeWorker.listen(testNamespace.message.ping, async () => {
        return 'pong from worker';
      });

      const message = testNamespace.send.ping(undefined);
      const response = await bridgeMain.dispatch(message);

      expect(response).toBe('pong from worker');
    });

    it('prevents sending mainToWorker message from worker bridge (runtime)', async () => {
      const message = testNamespace.send.ping(undefined);

      // Verify message has correct direction
      expect(message.meta.direction).toBe('mainToWorker');

      // TypeScript prevents this at compile time, but we test runtime validation by casting
      // @ts-expect-error - intentionally bypassing TypeScript to test runtime validation
      await expect(bridgeWorker.dispatch(message)).rejects.toThrow(
        Bridge.ERRORS.INVALID_DIRECTION('ping', 'mainToWorker', 'worker')
      );
    });
  });

  describe('workerToMain direction', () => {
    it('successfully sends workerToMain message from worker bridge', async () => {
      bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
        return { result: payload.value * 3 };
      });

      const message = testNamespace.send.calculate({ value: 5 });
      const response = await bridgeWorker.dispatch(message);

      expect(response).toEqual({ result: 15 });
    });

    it('prevents sending workerToMain message from main bridge (runtime)', async () => {
      const message = testNamespace.send.calculate({ value: 5 });

      // Verify message has correct direction
      expect(message.meta.direction).toBe('workerToMain');

      // TypeScript prevents this at compile time, but we test runtime validation by casting
      // @ts-expect-error - intentionally bypassing TypeScript to test runtime validation
      await expect(bridgeMain.dispatch(message)).rejects.toThrow(
        Bridge.ERRORS.INVALID_DIRECTION('calculate', 'workerToMain', 'main')
      );
    });
  });

  describe('bidirectional', () => {
    it('allows bidirectional messages from both main and worker', async () => {
      // Main -> Worker
      bridgeWorker.listen(testNamespace.message.notify, async (payload) => {
        expect(payload).toBe('notification from main');
      });

      // Worker -> Main
      bridgeMain.listen(testNamespace.message.notify, async (payload) => {
        expect(payload).toBe('notification from worker');
      });

      await bridgeMain.dispatch(testNamespace.send.notify('notification from main'));
      await bridgeWorker.dispatch(testNamespace.send.notify('notification from worker'));
    });
  });

  describe('Обработка ошибок', () => {
    it('handles errors thrown in message handler', async () => {
      bridgeMain.listen(testNamespace.message.calculate, async () => {
        throw new Error('Handler error');
      });

      const message = testNamespace.send.calculate({ value: 5 });

      await expect(bridgeWorker.dispatch(message)).rejects.toThrow('Handler error');
    });

    it('handles missing handler for message', async () => {
      const message = testNamespace.send.calculate({ value: 5 });

      await expect(bridgeWorker.dispatch(message)).rejects.toThrow(
        Bridge.ERRORS.NO_HANDLER('calculate')
      );
    });
  });
});

describe('Middleware', () => {
  let bridgeMain: Bridge<typeof testNamespace, TestChannel<'main'>>;
  let bridgeWorker: Bridge<typeof testNamespace, TestChannel<'worker'>>;

  beforeEach(() => {
    const [channelMain, channelWorker] = TestChannel.createPair();

    bridgeMain = new Bridge(testNamespace, channelMain);
    bridgeWorker = new Bridge(testNamespace, channelWorker);
  });

  it('transforms request before send', async () => {
    bridgeWorker.use({
      onBeforeSend: (namespace: string, messageName: string, request: unknown) => {
        const req = request as TTestRequest;
        return { value: req.value + 1 };
      },
    });

    bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
      return { result: payload.value };
    });

    const message = testNamespace.send.calculate({ value: 5 });
    const response = await bridgeWorker.dispatch(message);

    expect(response.result).toBe(6); // 5 + 1 from middleware
  });

  it('transforms response after receive', async () => {
    bridgeWorker.use({
      onAfterReceive: (namespace: string, messageName: string, response: unknown) => {
        const res = response as TTestResponse;
        return { result: res.result * 10 };
      },
    });

    bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
      return { result: payload.value * 2 };
    });

    const message = testNamespace.send.calculate({ value: 5 });
    const response = await bridgeWorker.dispatch(message);

    expect(response.result).toBe(100); // (5 * 2) * 10
  });

  it('transforms request before handling', async () => {
    bridgeMain.use({
      onBeforeHandle: (namespace, messageName, request: unknown) => {
        const req = request as TTestRequest;
        return { value: req.value + 10 };
      },
    });

    bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
      return { result: payload.value };
    });

    const message = testNamespace.send.calculate({ value: 5 });
    const response = await bridgeWorker.dispatch(message);

    expect(response.result).toBe(15); // 5 + 10 from middleware
  });

  it('transforms response after handling', async () => {
    bridgeMain.use({
      onAfterHandle: (namespace, messageName, response: unknown) => {
        const res = response as TTestResponse;
        return { result: res.result + 100 };
      },
    });

    bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
      return { result: payload.value * 2 };
    });

    const message = testNamespace.send.calculate({ value: 5 });
    const response = await bridgeWorker.dispatch(message);

    expect(response.result).toBe(110); // (5 * 2) + 100
  });

  it('calls error middleware on dispatch side', async () => {
    const errorSpy = vi.fn();

    bridgeWorker.use({
      onError: errorSpy,
    });

    bridgeMain.listen(testNamespace.message.calculate, async () => {
      throw new Error('Test error');
    });

    const message = testNamespace.send.calculate({ value: 5 });

    await expect(bridgeWorker.dispatch(message)).rejects.toThrow('Test error');
    expect(errorSpy).toHaveBeenCalledWith(
      testNamespace.namespaceName,
      'calculate',
      expect.any(Error)
    );
  });

  it('calls error middleware on handler side', async () => {
    const errorSpy = vi.fn();

    bridgeMain.use({
      onError: errorSpy,
    });

    bridgeMain.listen(testNamespace.message.calculate, async () => {
      throw new Error('Test error');
    });

    const message = testNamespace.send.calculate({ value: 5 });

    await expect(bridgeWorker.dispatch(message)).rejects.toThrow('Test error');
    expect(errorSpy).toHaveBeenCalledWith(
      testNamespace.namespaceName,
      'calculate',
      expect.any(Error)
    );
  });

  it('applies multiple middleware in order', async () => {
    const order: string[] = [];

    bridgeWorker.use({
      onBeforeSend: (namespace, messageName, request: unknown) => {
        const req = request as TTestRequest;
        order.push('before-send-1');
        return { value: req.value + 1 };
      },
    });

    bridgeWorker.use({
      onBeforeSend: (namespace, messageName, request: unknown) => {
        const req = request as TTestRequest;
        order.push('before-send-2');
        return { value: req.value + 1 };
      },
    });

    bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
      order.push('handler');
      return { result: payload.value };
    });

    const message = testNamespace.send.calculate({ value: 5 });
    const response = await bridgeWorker.dispatch(message);

    expect(order).toEqual(['before-send-1', 'before-send-2', 'handler']);
    expect(response.result).toBe(7); // 5 + 1 + 1
  });

  it('supports combined send and handle middleware', async () => {
    const order: string[] = [];

    bridgeWorker.use({
      onBeforeSend: (namespace, messageName, request: unknown) => {
        order.push('worker-before-send');
        return request;
      },
      onAfterReceive: (namespace, messageName, response: unknown) => {
        order.push('worker-after-receive');
        return response;
      },
    });

    bridgeMain.use({
      onBeforeHandle: (namespace, messageName, request: unknown) => {
        order.push('main-before-handle');
        return request;
      },
      onAfterHandle: (namespace, messageName, response: unknown) => {
        order.push('main-after-handle');
        return response;
      },
    });

    bridgeMain.listen(testNamespace.message.calculate, async (payload) => {
      order.push('main-handler');
      return { result: payload.value * 2 };
    });

    const message = testNamespace.send.calculate({ value: 5 });
    await bridgeWorker.dispatch(message);

    expect(order).toEqual([
      'worker-before-send',
      'main-before-handle',
      'main-handler',
      'main-after-handle',
      'worker-after-receive',
    ]);
  });
});
