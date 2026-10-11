import { afterEach, describe, expect, it, vi } from 'vitest';
import { NamespaceBuilder } from './../src/builder';
import { Bridge } from './../src/bridge';
import type { IChannel } from './../src/channel';
import type { TBridgeSide, TInternalMessage } from './../src/types';

type TPublishedMessage = {
  source: BroadcastTestChannel<TBridgeSide>;
  message: TInternalMessage;
};

class BroadcastTestBus {
  readonly messages: TPublishedMessage[] = [];
  dropMessage: (message: TInternalMessage) => boolean = () => false;
  private channels = new Set<BroadcastTestChannel<TBridgeSide>>();

  register(channel: BroadcastTestChannel<TBridgeSide>): void {
    this.channels.add(channel);
  }

  unregister(channel: BroadcastTestChannel<TBridgeSide>): void {
    this.channels.delete(channel);
  }

  publish(source: BroadcastTestChannel<TBridgeSide>, message: TInternalMessage): void {
    this.messages.push({ source, message });
    if (this.dropMessage(message)) {
      return;
    }
    for (const channel of this.channels) {
      if (channel !== source) {
        queueMicrotask(() => channel.deliver(message));
      }
    }
  }

  inject(channel: BroadcastTestChannel<TBridgeSide>, message: TInternalMessage): void {
    queueMicrotask(() => channel.deliver(message));
  }
}

class BroadcastTestChannel<TSide extends TBridgeSide> implements IChannel<TSide> {
  readonly side: TSide;
  receiverWasRegisteredAtInitialize = false;
  destroyCallCount = 0;
  private handlers: Array<(message: TInternalMessage) => void> = [];
  private locallyReady = false;

  constructor(
    side: TSide,
    private readonly bus: BroadcastTestBus,
    private readonly initializeResult: Promise<void> | Error | null = null,
    private readonly receivesWhileInitializing = false
  ) {
    this.side = side;
  }

  async initialize(): Promise<void> {
    this.receiverWasRegisteredAtInitialize = this.handlers.length > 0;
    if (this.receivesWhileInitializing) {
      this.bus.register(this as BroadcastTestChannel<TBridgeSide>);
    }
    if (this.initializeResult instanceof Error) {
      throw this.initializeResult;
    }
    if (this.initializeResult) {
      await this.initializeResult;
    }
    this.locallyReady = true;
    this.bus.register(this as BroadcastTestChannel<TBridgeSide>);
  }

  send(message: TInternalMessage): void {
    if (!this.locallyReady) {
      throw new Error('Channel is not ready');
    }
    this.bus.publish(this as BroadcastTestChannel<TBridgeSide>, message);
  }

  onMessage(handler: (message: TInternalMessage) => void): void {
    this.handlers.push(handler);
  }

  isReady(): boolean {
    return this.locallyReady;
  }

  destroy(): void {
    this.destroyCallCount += 1;
    this.locallyReady = false;
    this.bus.unregister(this as BroadcastTestChannel<TBridgeSide>);
    this.handlers = [];
  }

  deliver(message: TInternalMessage): void {
    if (this.locallyReady || this.receivesWhileInitializing) {
      this.handlers.forEach((handler) => handler(message));
    }
  }
}

const namespace = new NamespaceBuilder('handshake').mainToWorkerMessage<string, string>()('echo').build();
const otherNamespace = new NamespaceBuilder('other').build();

const handshakeConfig = { handshake: { timeout: 250, retryInterval: 10 } };

async function waitUntil(predicate: () => boolean, timeout = 200): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeout) {
      throw new Error('Condition was not met before test timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

describe('core handshake protocol', () => {
  const cleanup: Array<{ destroy(): void }> = [];

  afterEach(() => {
    cleanup.splice(0).forEach((value) => value.destroy());
  });

  it('connects when main starts before worker without polling HELLO', async () => {
    const bus = new BroadcastTestBus();
    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    cleanup.push(main);
    await Promise.resolve();

    expect(main.isReady()).toBe(false);
    expect(bus.messages.filter(({ message }) => message.type === 'hello')).toHaveLength(1);

    const worker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(worker);
    await Promise.all([main.ready(), worker.ready()]);

    expect(main.isReady()).toBe(true);
    expect(worker.isReady()).toBe(true);
    expect(bus.messages.some(({ message }) => message.type === 'hello-response')).toBe(false);
  });

  it('connects when worker starts before main by reactively repeating HELLO', async () => {
    const bus = new BroadcastTestBus();
    const worker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(worker);
    await Promise.resolve();

    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    cleanup.push(main);
    await Promise.all([main.ready(), worker.ready()]);

    const workerHellos = bus.messages.filter(({ message }) => message.type === 'hello' && message.sender === 'worker');
    expect(workerHellos).toHaveLength(2);
  });

  it('connects when both endpoints initialize concurrently', async () => {
    const bus = new BroadcastTestBus();
    let releaseInitialization = (): void => undefined;
    const initialization = new Promise<void>((resolve) => {
      releaseInitialization = resolve;
    });
    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus, initialization), handshakeConfig);
    const worker = new Bridge(namespace, new BroadcastTestChannel('worker', bus, initialization), handshakeConfig);
    cleanup.push(main, worker);
    releaseInitialization();

    await Promise.all([main.ready(), worker.ready()]);
    expect(main.isReady()).toBe(true);
    expect(worker.isReady()).toBe(true);
  });

  it('registers the receiver before asynchronous channel initialization', async () => {
    const bus = new BroadcastTestBus();
    const failure = new Error('initialization failed');
    const channel = new BroadcastTestChannel('main', bus, failure);
    const main = new Bridge(namespace, channel, handshakeConfig);
    cleanup.push(main);

    await expect(main.ready()).rejects.toBe(failure);
    expect(channel.receiverWasRegisteredAtInitialize).toBe(true);
    expect(main.isReady()).toBe(false);
  });

  it('ignores peer HELLO while local initialization is pending and connects afterwards', async () => {
    const bus = new BroadcastTestBus();
    let releaseInitialization = (): void => undefined;
    const initialization = new Promise<void>((resolve) => {
      releaseInitialization = resolve;
    });
    const mainChannel = new BroadcastTestChannel('main', bus, initialization, true);
    const main = new Bridge(namespace, mainChannel, handshakeConfig);
    const worker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(main, worker);

    await waitUntil(() => bus.messages.some(({ message }) => message.type === 'hello' && message.sender === 'worker'));
    await Promise.resolve();

    expect(bus.messages.some(({ source }) => source === mainChannel)).toBe(false);
    expect(main.isReady()).toBe(false);

    releaseInitialization();
    await Promise.all([main.ready(), worker.ready()]);

    expect(main.isReady()).toBe(true);
    expect(worker.isReady()).toBe(true);
  });

  it('keeps one readiness promise pending while the local channel has no peer', async () => {
    const bus = new BroadcastTestBus();
    const channel = new BroadcastTestChannel('main', bus);
    const main = new Bridge(namespace, channel, handshakeConfig);
    cleanup.push(main);
    const firstReadiness = main.ready();

    await Promise.resolve();
    expect(channel.isReady()).toBe(true);
    expect(main.isReady()).toBe(false);
    expect(main.ready()).toBe(firstReadiness);
  });

  it('queues dispatch until handshake and starts request delivery afterwards', async () => {
    const bus = new BroadcastTestBus();
    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    cleanup.push(main);
    const response = main.dispatch(namespace.send.echo('queued'));
    await Promise.resolve();
    expect(bus.messages.some(({ message }) => message.family === 'application')).toBe(false);

    const worker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(worker);
    worker.listen(namespace.message.echo, async (value) => value);

    await expect(response).resolves.toBe('queued');
  });

  it('retries SELECT and reuses the session when the first CONNECTED is lost', async () => {
    const bus = new BroadcastTestBus();
    let droppedConnected = false;
    bus.dropMessage = (message) => {
      if (message.type === 'connected' && !droppedConnected) {
        droppedConnected = true;
        return true;
      }
      return false;
    };
    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    const worker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(main, worker);

    await Promise.all([main.ready(), worker.ready()]);
    const selections = bus.messages.map(({ message }) => message).filter((message) => message.type === 'select');
    expect(selections.length).toBeGreaterThanOrEqual(2);
    expect(new Set(selections.map((message) => message.sessionId))).toHaveLength(1);
  });

  it('selects only one of multiple workers on a shared bus', async () => {
    const bus = new BroadcastTestBus();
    const workerOne = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    const workerTwo = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    cleanup.push(main, workerOne, workerTwo);

    await main.ready();
    await waitUntil(() => workerOne.isReady() || workerTwo.isReady());
    expect([workerOne, workerTwo].filter((worker) => worker.isReady())).toHaveLength(1);
  });

  it('ignores unrelated and incompatible announcements before selecting a compatible worker', async () => {
    const bus = new BroadcastTestBus();
    const mainChannel = new BroadcastTestChannel('main', bus);
    const main = new Bridge(namespace, mainChannel, handshakeConfig);
    const unrelatedWorker = new Bridge(otherNamespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(main, unrelatedWorker);
    await Promise.resolve();
    expect(main.isReady()).toBe(false);

    bus.inject(mainChannel, {
      family: 'control',
      type: 'hello',
      protocolVersion: 2,
      namespace: namespace.namespaceName,
      endpointId: 'incompatible-worker',
      sender: 'worker',
    } as unknown as TInternalMessage);
    await Promise.resolve();

    expect(main.isReady()).toBe(false);
    expect(bus.messages.some(({ message }) => message.type === 'reject')).toBe(false);

    const compatibleWorker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(compatibleWorker);

    await Promise.all([main.ready(), compatibleWorker.ready()]);
    expect(main.isReady()).toBe(true);
    expect(compatibleWorker.isReady()).toBe(true);
  });

  it('rejects an addressed handshake frame with an incompatible protocol version', async () => {
    const bus = new BroadcastTestBus();
    const workerChannel = new BroadcastTestChannel('worker', bus);
    const worker = new Bridge(namespace, workerChannel, handshakeConfig);
    cleanup.push(worker);
    await waitUntil(() => bus.messages.some(({ message }) => message.type === 'hello'));
    const workerHello = bus.messages.find(({ message }) => message.type === 'hello')?.message;
    expect(workerHello?.type).toBe('hello');
    if (!workerHello || workerHello.type !== 'hello') {
      throw new Error('Expected worker HELLO');
    }

    bus.inject(workerChannel, {
      family: 'control',
      type: 'select',
      protocolVersion: 2,
      namespace: namespace.namespaceName,
      endpointId: 'incompatible-main',
      targetEndpointId: workerHello.endpointId,
      sender: 'main',
      sessionId: 'incompatible-session',
    } as unknown as TInternalMessage);

    await expect(worker.ready()).rejects.toThrow(Bridge.ERRORS.INCOMPATIBLE_PROTOCOL(2));
    expect(
      bus.messages.some(
        ({ message }) =>
          message.type === 'reject' &&
          message.targetEndpointId === 'incompatible-main' &&
          message.reason === 'incompatible-version'
      )
    ).toBe(true);
  });

  it('ignores unknown and malformed control frames without settling readiness', async () => {
    const bus = new BroadcastTestBus();
    const workerChannel = new BroadcastTestChannel('worker', bus);
    const worker = new Bridge(namespace, workerChannel, handshakeConfig);
    cleanup.push(worker);
    await waitUntil(() => bus.messages.some(({ message }) => message.type === 'hello'));
    const workerHello = bus.messages.find(({ message }) => message.type === 'hello')?.message;
    expect(workerHello?.type).toBe('hello');
    if (!workerHello || workerHello.type !== 'hello') {
      throw new Error('Expected worker HELLO');
    }

    bus.inject(workerChannel, {
      family: 'control',
      type: 'unknown-control',
      protocolVersion: 1,
      namespace: namespace.namespaceName,
      endpointId: 'unknown-main',
      sender: 'main',
    } as unknown as TInternalMessage);
    bus.inject(workerChannel, {
      family: 'control',
      type: 'toString',
      protocolVersion: 1,
      namespace: namespace.namespaceName,
      endpointId: 'prototype-main',
      sender: 'main',
    } as unknown as TInternalMessage);
    bus.inject(workerChannel, {
      family: 'control',
      type: 'select',
      protocolVersion: 1,
      namespace: namespace.namespaceName,
      endpointId: 'malformed-main',
      targetEndpointId: workerHello.endpointId,
      sender: 'main',
    } as unknown as TInternalMessage);
    await Promise.resolve();
    await Promise.resolve();

    expect(worker.isReady()).toBe(false);
    expect(bus.messages.some(({ message }) => message.type === 'connected')).toBe(false);
    expect(bus.messages.some(({ message }) => message.type === 'reject')).toBe(false);

    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    cleanup.push(main);
    await Promise.all([main.ready(), worker.ready()]);
    expect(worker.isReady()).toBe(true);
  });

  it('fails readiness on addressed rejection and on handshake timeout', async () => {
    const rejectionBus = new BroadcastTestBus();
    const rejectionChannel = new BroadcastTestChannel('main', rejectionBus);
    const rejectedMain = new Bridge(namespace, rejectionChannel, handshakeConfig);
    cleanup.push(rejectedMain);
    await waitUntil(() => rejectionBus.messages.length > 0);
    const hello = rejectionBus.messages[0].message;
    rejectionBus.inject(rejectionChannel, {
      family: 'control',
      type: 'reject',
      protocolVersion: 1,
      namespace: namespace.namespaceName,
      endpointId: 'worker',
      targetEndpointId: hello.endpointId,
      sender: 'worker',
      reason: 'busy',
    });
    await expect(rejectedMain.ready()).rejects.toThrow(Bridge.ERRORS.HANDSHAKE_REJECTED('busy'));

    const timeoutBus = new BroadcastTestBus();
    const timeoutMain = new Bridge(namespace, new BroadcastTestChannel('main', timeoutBus), {
      handshake: { timeout: 15, retryInterval: 5 },
    });
    cleanup.push(timeoutMain);
    const pendingDispatch = timeoutMain.dispatch(namespace.send.echo('never sent'));
    await expect(timeoutMain.ready()).rejects.toThrow(Bridge.ERRORS.HANDSHAKE_TIMEOUT);
    await expect(pendingDispatch).rejects.toThrow(Bridge.ERRORS.HANDSHAKE_TIMEOUT);
    expect(timeoutBus.messages.some(({ message }) => message.family === 'application')).toBe(false);
    const messagesAtTimeout = timeoutBus.messages.length;
    const lateWorker = new Bridge(namespace, new BroadcastTestChannel('worker', timeoutBus), handshakeConfig);
    cleanup.push(lateWorker);
    await Promise.resolve();
    await Promise.resolve();
    expect(timeoutBus.messages).toHaveLength(messagesAtTimeout + 1);
  });

  it('rejects pending readiness on destruction and remains inert', async () => {
    const bus = new BroadcastTestBus();
    const channel = new BroadcastTestChannel('main', bus);
    const main = new Bridge(namespace, channel, handshakeConfig);
    cleanup.push(main);
    const readiness = main.ready();
    await Promise.resolve();
    main.destroy();

    await expect(readiness).rejects.toThrow(Bridge.ERRORS.BRIDGE_DESTROYED);
    expect(main.isReady()).toBe(false);
    expect(() => main.destroy()).not.toThrow();
  });

  it('destroys the channel again when initialization finishes after bridge destruction', async () => {
    const bus = new BroadcastTestBus();
    let releaseInitialization = (): void => undefined;
    const initialization = new Promise<void>((resolve) => {
      releaseInitialization = resolve;
    });
    const channel = new BroadcastTestChannel('main', bus, initialization);
    const main = new Bridge(namespace, channel, handshakeConfig);
    cleanup.push(main);
    const readiness = main.ready();

    main.destroy();
    expect(channel.destroyCallCount).toBe(1);
    releaseInitialization();

    await expect(readiness).rejects.toThrow(Bridge.ERRORS.BRIDGE_DESTROYED);
    await waitUntil(() => channel.destroyCallCount === 2);
    expect(channel.isReady()).toBe(false);
    expect(bus.messages.some(({ source }) => source === channel)).toBe(false);
  });

  it('keeps control frames out of middleware and ignores foreign-session traffic', async () => {
    const bus = new BroadcastTestBus();
    const mainChannel = new BroadcastTestChannel('main', bus);
    const workerChannel = new BroadcastTestChannel('worker', bus);
    const main = new Bridge(namespace, mainChannel, handshakeConfig);
    const worker = new Bridge(namespace, workerChannel, handshakeConfig);
    cleanup.push(main, worker);
    const middleware = {
      onBeforeSend: vi.fn((_: string, __: string, value: unknown) => value),
      onAfterReceive: vi.fn((_: string, __: string, value: unknown) => value),
      onBeforeHandle: vi.fn((_: string, __: string, value: unknown) => value),
      onAfterHandle: vi.fn((_: string, __: string, value: unknown) => value),
    };
    const handler = vi.fn(async (value: string) => value);
    main.use(middleware);
    worker.use(middleware);
    worker.listen(namespace.message.echo, handler);
    await Promise.all([main.ready(), worker.ready()]);

    expect(Object.values(middleware).every((hook) => hook.mock.calls.length === 0)).toBe(true);
    const select = bus.messages.map(({ message }) => message).find((message) => message.type === 'select');
    expect(select?.type).toBe('select');
    if (!select || select.type !== 'select') {
      throw new Error('Expected SELECT');
    }
    bus.inject(workerChannel, {
      family: 'application',
      type: 'request',
      id: 'foreign-request',
      namespace: namespace.namespaceName,
      name: 'echo',
      endpointId: select.endpointId,
      targetEndpointId: select.targetEndpointId,
      sender: 'main',
      sessionId: 'foreign-session',
      data: 'ignored',
    });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    await expect(main.dispatch(namespace.send.echo('application'))).resolves.toBe('application');
    expect(middleware.onBeforeSend).toHaveBeenCalledTimes(1);
    expect(middleware.onBeforeHandle).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed envelopes that target an active request', async () => {
    const bus = new BroadcastTestBus();
    const mainChannel = new BroadcastTestChannel('main', bus);
    const workerChannel = new BroadcastTestChannel('worker', bus);
    const main = new Bridge(namespace, mainChannel, handshakeConfig);
    const worker = new Bridge(namespace, workerChannel, handshakeConfig);
    cleanup.push(main, worker);
    let releaseHandler = (_value: string): void => undefined;
    const handlerGate = new Promise<string>((resolve) => {
      releaseHandler = resolve;
    });
    worker.listen(namespace.message.echo, () => handlerGate);
    await Promise.all([main.ready(), worker.ready()]);

    const response = main.dispatch(namespace.send.echo('request'));
    await waitUntil(() =>
      bus.messages.some(({ message }) => message.family === 'application' && message.type === 'request')
    );
    const request = bus.messages
      .map(({ message }) => message)
      .find((message) => message.family === 'application' && message.type === 'request');
    expect(request?.family).toBe('application');
    if (!request || request.family !== 'application' || request.type !== 'request') {
      throw new Error('Expected application request');
    }

    const settlement = vi.fn();
    void response.then(settlement, settlement);
    const responseAddress = {
      id: request.id,
      namespace: request.namespace,
      name: '',
      endpointId: request.targetEndpointId,
      targetEndpointId: request.endpointId,
      sessionId: request.sessionId,
      sender: 'worker',
    } as const;
    bus.inject(mainChannel, {
      ...responseAddress,
      family: 'unknown',
      type: 'error',
      error: 'forged error',
    } as unknown as TInternalMessage);
    bus.inject(mainChannel, {
      ...responseAddress,
      family: 'application',
      type: 'unknown-application',
      error: 'forged error',
    } as unknown as TInternalMessage);
    await Promise.resolve();
    await Promise.resolve();

    expect(settlement).not.toHaveBeenCalled();
    releaseHandler('real response');
    await expect(response).resolves.toBe('real response');
  });

  it('does not send after destruction while asynchronous send middleware is pending', async () => {
    const bus = new BroadcastTestBus();
    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    const worker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(main, worker);
    worker.listen(namespace.message.echo, async (value) => value);
    await Promise.all([main.ready(), worker.ready()]);

    let releaseMiddleware = (): void => undefined;
    let markMiddlewareStarted = (): void => undefined;
    const middlewareStarted = new Promise<void>((resolve) => {
      markMiddlewareStarted = resolve;
    });
    const middlewareGate = new Promise<void>((resolve) => {
      releaseMiddleware = resolve;
    });
    main.use({
      onBeforeSend: async (_namespace, _messageName, value) => {
        markMiddlewareStarted();
        await middlewareGate;
        return value;
      },
    });

    const applicationMessagesBeforeDispatch = bus.messages.filter(
      ({ message }) => message.family === 'application'
    ).length;
    const response = main.dispatch(namespace.send.echo('not sent'));
    await middlewareStarted;
    main.destroy();
    releaseMiddleware();

    await expect(response).rejects.toThrow(Bridge.ERRORS.BRIDGE_DESTROYED);
    expect(bus.messages.filter(({ message }) => message.family === 'application')).toHaveLength(
      applicationMessagesBeforeDispatch
    );
  });

  it('does not replace an established peer when another worker announces', async () => {
    const bus = new BroadcastTestBus();
    const main = new Bridge(namespace, new BroadcastTestChannel('main', bus), handshakeConfig);
    const firstWorker = new Bridge(namespace, new BroadcastTestChannel('worker', bus), handshakeConfig);
    cleanup.push(main, firstWorker);
    await Promise.all([main.ready(), firstWorker.ready()]);
    const firstSelection = bus.messages.map(({ message }) => message).find((message) => message.type === 'select');

    firstWorker.destroy();
    const replacement = new Bridge(namespace, new BroadcastTestChannel('worker', bus), {
      handshake: { timeout: 30, retryInterval: 5 },
    });
    cleanup.push(replacement);
    await expect(replacement.ready()).rejects.toThrow(Bridge.ERRORS.HANDSHAKE_TIMEOUT);
    const selections = bus.messages.map(({ message }) => message).filter((message) => message.type === 'select');
    expect(selections).toHaveLength(1);
    expect(selections[0]).toEqual(firstSelection);
    expect(main.isReady()).toBe(true);
  });
});
