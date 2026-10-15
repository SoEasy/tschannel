/**
 * Runs application transformations and reports lifecycle observations.
 * Control frames are observed without entering application transformation stages.
 */
import type { TBridgeSide, TEndpointId, THandshakeMessage } from '../types';
import type {
  IMiddlewarePipeline,
  TBridgeMiddleware,
  TDispatchTrace,
  TIncomingHandshakeMessage,
  TObservePhase,
  TObservedMessage,
} from './contracts';

/** Executes registered middleware in order without exposing Bridge state. */
export class MiddlewarePipeline implements IMiddlewarePipeline {
  /** Ordered registrations shared by transformations and observation. */
  private readonly middleware: Array<TBridgeMiddleware> = [];

  /** Captures the namespace and local side reported to middleware hooks. */
  constructor(
    /** Namespace supplied to application transformation and error hooks. */
    private readonly namespace: string,
    /** Local side attached to observer snapshots. */
    private readonly side: TBridgeSide
  ) {}

  /** Appends a middleware instance after existing registrations. */
  use(middleware: TBridgeMiddleware): void {
    this.middleware.push(middleware);
  }

  /** Drops all hooks when the owning Bridge is destroyed. */
  clear(): void {
    this.middleware.length = 0;
  }

  /** Chains outgoing request transforms before channel submission. */
  beforeSend(messageName: string, data: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentData) =>
          middleware.onBeforeSend ? middleware.onBeforeSend(this.namespace, messageName, currentData) : currentData
        ),
      Promise.resolve(data)
    );
  }

  /** Chains successful response transforms before dispatch resolves. */
  afterReceive(messageName: string, response: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentResponse) =>
          middleware.onAfterReceive
            ? middleware.onAfterReceive(this.namespace, messageName, currentResponse)
            : currentResponse
        ),
      Promise.resolve(response)
    );
  }

  /** Chains admitted request transforms before the listener runs. */
  beforeHandle(messageName: string, data: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentData) =>
          middleware.onBeforeHandle ? middleware.onBeforeHandle(this.namespace, messageName, currentData) : currentData
        ),
      Promise.resolve(data)
    );
  }

  /** Chains listener-result transforms before a response is sent. */
  afterHandle(messageName: string, response: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentResponse) =>
          middleware.onAfterHandle
            ? middleware.onAfterHandle(this.namespace, messageName, currentResponse)
            : currentResponse
        ),
      Promise.resolve(response)
    );
  }

  /** Calls synchronous error hooks on the side that observed the failure. */
  reportError(messageName: string, error: Error): void {
    this.middleware.forEach((middleware) => {
      if (middleware.onError) {
        middleware.onError(this.namespace, messageName, error);
      }
    });
  }

  /** Captures an application trace at the named lifecycle phase. */
  observeApplication(trace: TDispatchTrace, phase: TObservePhase, error?: Error): void {
    this.notifyObservers(
      {
        family: 'application',
        kind: trace.kind,
        namespace: this.namespace,
        name: trace.name,
        id: trace.id,
        side: this.side,
        value: trace.value,
        ...(error ? { error, failedAt: trace.failedAt } : {}),
      },
      phase
    );
  }

  /** Emits one terminal failed phase unless the trace has already settled. */
  failApplication(trace: TDispatchTrace, error: Error): void {
    if (trace.isFailed || trace.isCompleted) {
      return;
    }
    trace.isFailed = true;
    this.observeApplication(trace, 'failed', error);
  }

  /** Captures a sent or received handshake frame for observers. */
  observeControl(message: THandshakeMessage | TIncomingHandshakeMessage, phase: TObservePhase): void {
    this.notifyObservers(
      {
        family: 'control',
        kind: message.type,
        namespace: message.namespace,
        side: this.side,
        endpointId: message.endpointId,
        protocolVersion: message.protocolVersion,
        ...('targetEndpointId' in message ? { targetEndpointId: message.targetEndpointId } : {}),
        ...('sessionId' in message ? { sessionId: message.sessionId } : {}),
        ...('reason' in message ? { reason: message.reason } : {}),
      },
      phase
    );
  }

  /** Captures a local handshake failure without constructing a wire frame. */
  observeControlFailure(endpointId: TEndpointId, error: Error): void {
    this.notifyObservers(
      {
        family: 'control',
        kind: 'handshake',
        namespace: this.namespace,
        side: this.side,
        endpointId,
        error,
        failedAt: 'handshake',
      },
      'failed'
    );
  }

  /** Delivers frozen snapshots asynchronously and isolates observer failures. */
  private notifyObservers(message: TObservedMessage, phase: TObservePhase): void {
    const observers = this.middleware.filter((entry) => entry.observe !== undefined);
    if (observers.length === 0) {
      return;
    }
    void Promise.resolve().then(() => {
      observers.forEach((entry) => {
        try {
          const result = entry.observe?.(Object.freeze({ ...message }), phase);
          void Promise.resolve(result).catch(() => undefined);
        } catch {
          // An observer cannot change the message or handshake outcome.
        }
      });
    });
  }
}
