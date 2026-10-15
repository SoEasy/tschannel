import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bridge, type TObservedMessage, type TObservePhase } from '../src/bridge';
import { NamespaceBuilder } from '../src/builder';
import type { IChannel } from '../src/channel';
import type { TBridgeSide, TInternalMessage } from '../src/types';

type TObservation = { message: TObservedMessage; phase: TObservePhase };

class SynchronousBus {
  readonly messages: TInternalMessage[] = [];
  private readonly channels = new Set<SynchronousChannel<TBridgeSide>>();

  register(channel: SynchronousChannel<TBridgeSide>): void {
    this.channels.add(channel);
  }

  unregister(channel: SynchronousChannel<TBridgeSide>): void {
    this.channels.delete(channel);
  }

  send(source: SynchronousChannel<TBridgeSide>, message: TInternalMessage): void {
    this.messages.push(message);
    this.channels.forEach((channel) => {
      if (channel !== source) {
        channel.deliver(message);
      }
    });
  }
}

class SynchronousChannel<TSide extends TBridgeSide> implements IChannel<TSide> {
  private receiver: ((message: TInternalMessage) => void) | null = null;
  private ready = false;

  constructor(
    readonly side: TSide,
    private readonly bus: SynchronousBus,
    private readonly initialization: Promise<void> = Promise.resolve()
  ) {}

  async initialize(): Promise<void> {
    await this.initialization;
    this.ready = true;
    this.bus.register(this as SynchronousChannel<TBridgeSide>);
  }

  send(message: TInternalMessage): void {
    if (!this.ready) {
      throw new Error('Channel is not ready');
    }
    this.bus.send(this as SynchronousChannel<TBridgeSide>, message);
  }

  onMessage(receiver: (message: TInternalMessage) => void): void {
    this.receiver = receiver;
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.ready = false;
    this.receiver = null;
    this.bus.unregister(this as SynchronousChannel<TBridgeSide>);
  }

  deliver(message: TInternalMessage): void {
    this.receiver?.(message);
  }
}

const namespace = new NamespaceBuilder('observed')
  .mainToWorkerMessage<{ name: string }, { age: string | number }>()('getAge')
  .build();
const handshake = { handshake: { timeout: 100, retryInterval: 10 }, timeout: 20 };

function collect(bridge: Bridge<typeof namespace, SynchronousChannel<TBridgeSide>>): TObservation[] {
  const events: TObservation[] = [];
  bridge.use({ observe: (message, phase) => events.push({ message, phase }) });
  return events;
}

async function flushObservations(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Bridge middleware observation', () => {
  const cleanup: Array<{ destroy(): void }> = [];

  afterEach(() => {
    cleanup.splice(0).forEach((bridge) => bridge.destroy());
  });

  it('reports the full local phase order and transformed values through a reentrant channel', async () => {
    const bus = new SynchronousBus();
    const main = new Bridge(namespace, new SynchronousChannel('main', bus), handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus), handshake);
    cleanup.push(main, worker);
    await Promise.all([main.ready(), worker.ready()]);

    const mainEvents = collect(main);
    const workerEvents = collect(worker);
    main.use({ observe: () => new Promise<void>(() => undefined) });
    main.use({
      onBeforeSend: (_namespace, _name, value) => ({ ...(value as { name: string }), additional: 1 }),
      onAfterReceive: (_namespace, _name, value) => ({ age: Number((value as { age: string }).age) }),
    });
    worker.use({
      onBeforeHandle: (_namespace, _name, value) => value,
      onAfterHandle: (_namespace, _name, value) => value,
    });
    worker.listen(namespace.message.getAge, () => ({ age: '25' }));

    await expect(main.dispatch(namespace.send.getAge({ name: 'getAge' }))).resolves.toEqual({ age: 25 });
    await flushObservations();

    expect(mainEvents.map(({ phase }) => phase)).toEqual([
      'dispatchStarted',
      'sendPrepared',
      'requestSent',
      'responseReceived',
      'completed',
    ]);
    expect(workerEvents.map(({ phase }) => phase)).toEqual([
      'requestReceived',
      'handlePrepared',
      'handled',
      'responsePrepared',
      'responseSent',
    ]);
    expect(mainEvents[0].message).toMatchObject({ name: 'getAge', value: { name: 'getAge' } });
    expect(mainEvents[1].message).toMatchObject({ value: { name: 'getAge', additional: 1 } });
    expect(mainEvents[3].message).toMatchObject({ value: { age: '25' } });
    expect(mainEvents[4].message).toMatchObject({ value: { age: 25 } });
    expect(new Set(mainEvents.map(({ message }) => message.family === 'application' && message.id)).size).toBe(1);
    expect(mainEvents[0].message).toMatchObject({
      id: workerEvents[0].message.family === 'application' && workerEvents[0].message.id,
    });
  });

  it('reports unchanged stage results without hooks and distinct IDs for concurrent requests', async () => {
    const bus = new SynchronousBus();
    const main = new Bridge(namespace, new SynchronousChannel('main', bus), handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus), handshake);
    cleanup.push(main, worker);
    await Promise.all([main.ready(), worker.ready()]);
    const mainEvents = collect(main);
    const workerEvents = collect(worker);
    worker.listen(namespace.message.getAge, () => ({ age: '25' }));

    await Promise.all([
      main.dispatch(namespace.send.getAge({ name: 'first' })),
      main.dispatch(namespace.send.getAge({ name: 'second' })),
    ]);
    await flushObservations();

    const starts = mainEvents.filter(({ phase }) => phase === 'dispatchStarted');
    expect(starts).toHaveLength(2);
    expect(starts[0].message).not.toMatchObject({
      id: starts[1].message.family === 'application' && starts[1].message.id,
    });
    expect(mainEvents.filter(({ phase }) => phase === 'sendPrepared')).toHaveLength(2);
    expect(mainEvents.filter(({ phase }) => phase === 'completed')).toHaveLength(2);
    expect(workerEvents.filter(({ phase }) => phase === 'handlePrepared')).toHaveLength(2);
    expect(workerEvents.filter(({ phase }) => phase === 'responsePrepared')).toHaveLength(2);
    expect(mainEvents.find(({ phase }) => phase === 'completed')?.message).toMatchObject({ value: { age: '25' } });
  });

  it('captures the result after multiple hooks at a stage', async () => {
    const bus = new SynchronousBus();
    const main = new Bridge(namespace, new SynchronousChannel('main', bus), handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus), handshake);
    cleanup.push(main, worker);
    await Promise.all([main.ready(), worker.ready()]);
    const events = collect(main);
    main.use({ onBeforeSend: (_namespace, _name, value) => ({ ...(value as object), additional: 1 }) });
    main.use({ onBeforeSend: (_namespace, _name, value) => ({ ...(value as object), additional: 2 }) });
    worker.listen(namespace.message.getAge, () => ({ age: '25' }));

    await main.dispatch(namespace.send.getAge({ name: 'getAge' }));
    await flushObservations();
    expect(events.find(({ phase }) => phase === 'sendPrepared')?.message).toMatchObject({
      value: { name: 'getAge', additional: 2 },
    });
  });

  it('reports failures on both sides without inventing successful phases', async () => {
    const bus = new SynchronousBus();
    const main = new Bridge(namespace, new SynchronousChannel('main', bus), handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus), handshake);
    cleanup.push(main, worker);
    await Promise.all([main.ready(), worker.ready()]);
    const mainEvents = collect(main);
    const workerEvents = collect(worker);
    worker.listen(namespace.message.getAge, () => {
      throw new Error('handler failed');
    });

    await expect(main.dispatch(namespace.send.getAge({ name: 'getAge' }))).rejects.toThrow('handler failed');
    await flushObservations();

    expect(workerEvents.map(({ phase }) => phase)).toEqual([
      'requestReceived',
      'handlePrepared',
      'failed',
      'responseSent',
    ]);
    expect(mainEvents.map(({ phase }) => phase)).toEqual([
      'dispatchStarted',
      'sendPrepared',
      'requestSent',
      'responseReceived',
      'failed',
    ]);
    expect(workerEvents.find(({ phase }) => phase === 'failed')?.message).toMatchObject({ failedAt: 'handler' });
    expect(mainEvents.find(({ phase }) => phase === 'failed')?.message).toMatchObject({ failedAt: 'responseReceived' });
  });

  it('reports a timeout and a send middleware rejection with their failing stages', async () => {
    const bus = new SynchronousBus();
    const main = new Bridge(namespace, new SynchronousChannel('main', bus), handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus), handshake);
    cleanup.push(main, worker);
    await Promise.all([main.ready(), worker.ready()]);
    const events = collect(main);
    worker.listen(namespace.message.getAge, () => new Promise<{ age: string }>(() => undefined));

    await expect(main.dispatch(namespace.send.getAge({ name: 'timeout' }))).rejects.toThrow('Message timeout');
    await flushObservations();
    expect(events.find(({ phase }) => phase === 'failed')?.message).toMatchObject({ failedAt: 'requestSent' });

    main.use({ onBeforeSend: () => Promise.reject(new Error('transform failed')) });
    await expect(main.dispatch(namespace.send.getAge({ name: 'rejected' }))).rejects.toThrow('transform failed');
    await flushObservations();
    expect(events.filter(({ phase }) => phase === 'failed').at(-1)?.message).toMatchObject({
      failedAt: 'onBeforeSend',
    });
  });

  it('reports a missing handler and ignores a response from another session', async () => {
    const bus = new SynchronousBus();
    const mainChannel = new SynchronousChannel('main', bus);
    const main = new Bridge(namespace, mainChannel, handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus), handshake);
    cleanup.push(main, worker);
    await Promise.all([main.ready(), worker.ready()]);
    const mainEvents = collect(main);
    const workerEvents = collect(worker);

    await expect(main.dispatch(namespace.send.getAge({ name: 'missing' }))).rejects.toThrow(
      Bridge.ERRORS.NO_HANDLER('getAge')
    );
    await flushObservations();
    expect(workerEvents.map(({ phase }) => phase)).toEqual(['requestReceived', 'failed', 'responseSent']);
    expect(workerEvents.find(({ phase }) => phase === 'failed')?.message).toMatchObject({ failedAt: 'handler' });
    const observedCount = mainEvents.length;
    const sentRequest = bus.messages.find((message) => message.family === 'application' && message.type === 'request');
    if (!sentRequest || sentRequest.family !== 'application' || sentRequest.type !== 'request') {
      throw new Error('Expected a request');
    }
    mainChannel.deliver({
      ...sentRequest,
      type: 'response',
      sender: 'worker',
      endpointId: sentRequest.targetEndpointId,
      targetEndpointId: sentRequest.endpointId,
      sessionId: 'foreign-session',
      data: { age: '99' },
    });
    await flushObservations();
    expect(mainEvents).toHaveLength(observedCount);
  });

  it('fails a pending response transformation when the bridge is destroyed', async () => {
    const bus = new SynchronousBus();
    const main = new Bridge(namespace, new SynchronousChannel('main', bus), handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus), handshake);
    cleanup.push(main, worker);
    await Promise.all([main.ready(), worker.ready()]);
    const events = collect(main);
    let finishTransform = (_value: { age: number }): void => undefined;
    main.use({
      onAfterReceive: () =>
        new Promise<{ age: number }>((resolve) => {
          finishTransform = resolve;
        }),
    });
    worker.listen(namespace.message.getAge, () => ({ age: '25' }));
    const pending = main.dispatch(namespace.send.getAge({ name: 'getAge' }));
    await vi.waitFor(() => {
      expect(events.map(({ phase }) => phase)).toContain('responseReceived');
    });
    main.destroy();
    await expect(pending).rejects.toThrow(Bridge.ERRORS.BRIDGE_DESTROYED);
    finishTransform({ age: 25 });
    await flushObservations();
    expect(events.map(({ phase }) => phase)).toEqual([
      'dispatchStarted',
      'sendPrepared',
      'requestSent',
      'responseReceived',
      'failed',
    ]);
  });

  it('observes handshake frames without giving observers control over negotiation', async () => {
    const bus = new SynchronousBus();
    let release = (): void => undefined;
    const initialization = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mainChannel = new SynchronousChannel('main', bus, initialization);
    const main = new Bridge(namespace, mainChannel, handshake);
    const worker = new Bridge(namespace, new SynchronousChannel('worker', bus, initialization), handshake);
    cleanup.push(main, worker);
    const events = collect(main);
    const secondObserver = vi.fn();
    const transform = vi.fn();
    main.use({
      observe: (message, phase) => {
        if (message.family === 'control' && phase === 'controlReceived') {
          (message as { endpointId?: string }).endpointId = 'corrupted';
        }
        return Promise.reject(new Error('observer failed'));
      },
      onBeforeSend: transform,
    });
    main.use({ observe: secondObserver });
    worker.use({ observe: () => new Promise<void>(() => undefined) });
    release();

    await Promise.all([main.ready(), worker.ready()]);
    await flushObservations();
    expect(main.isReady()).toBe(true);
    expect(events.filter(({ phase }) => phase === 'controlSent').map(({ message }) => message.kind)).toContain('hello');
    expect(events.filter(({ phase }) => phase === 'controlReceived').map(({ message }) => message.kind)).toContain(
      'connected'
    );
    expect(secondObserver).toHaveBeenCalled();
    expect(transform).not.toHaveBeenCalled();
    expect(mainEventsAreControlOnly(events)).toBe(true);

    const before = events.length;
    const hello = bus.messages.find(
      (message) => message.family === 'control' && message.type === 'hello' && message.sender === 'main'
    );
    if (!hello || hello.family !== 'control') {
      throw new Error('Expected main HELLO');
    }
    mainChannel.deliver({ ...hello, type: 'unknown' } as unknown as TInternalMessage);
    mainChannel.deliver({ ...hello, sender: 'main' });
    mainChannel.deliver({ ...hello, targetEndpointId: 'another-endpoint' } as TInternalMessage);
    await flushObservations();
    expect(events).toHaveLength(before);
  });

  it('reports handshake timeout and pending dispatch failure after destruction', async () => {
    const bus = new SynchronousBus();
    const main = new Bridge(namespace, new SynchronousChannel('main', bus), {
      handshake: { timeout: 15, retryInterval: 5 },
    });
    cleanup.push(main);
    const events = collect(main);
    const request = main.dispatch(namespace.send.getAge({ name: 'waiting' }));
    await expect(request).rejects.toThrow(Bridge.ERRORS.HANDSHAKE_TIMEOUT);
    await flushObservations();
    expect(events.filter(({ phase }) => phase === 'failed').map(({ message }) => message.family)).toEqual([
      'control',
      'application',
    ]);
    expect(
      events.find(({ phase, message }) => phase === 'failed' && message.family === 'application')?.message
    ).toMatchObject({
      failedAt: 'readiness',
    });

    const other = new Bridge(namespace, new SynchronousChannel('main', new SynchronousBus()), handshake);
    cleanup.push(other);
    const pendingEvents = collect(other);
    const pending = other.dispatch(namespace.send.getAge({ name: 'destroyed' }));
    other.destroy();
    await expect(pending).rejects.toThrow(Bridge.ERRORS.BRIDGE_DESTROYED);
    await flushObservations();
    expect(pendingEvents.filter(({ phase }) => phase === 'failed').map(({ message }) => message.family)).toEqual([
      'control',
      'application',
    ]);
  });
});

function mainEventsAreControlOnly(events: TObservation[]): boolean {
  return events.every(({ message }) => message.family === 'control');
}
