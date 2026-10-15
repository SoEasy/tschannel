import type { NamespaceMessages, TMessageBase, TMessageToListen, TMessageToSend } from './builder';
import type { IChannel } from './channel';
import {
  type TApplicationMessage,
  type TBridgeSide,
  type TEndpointId,
  type THandshakeConnected,
  type THandshakeHello,
  type THandshakeMessage,
  type THandshakeReject,
  type THandshakeRejectReason,
  type THandshakeSelect,
  type TInternalMessage,
  type TMessageDirection,
  TSCHANNEL_PROTOCOL_VERSION,
  type TSessionId,
} from './types';
import { generateMessageId } from './utils';

export type THandshakeConfig = {
  timeout?: number;
  retryInterval?: number;
};

/** Configuration for Bridge. */
export type TBridgeConfig = {
  timeout?: number;
  retries?: number;
  handshake?: THandshakeConfig;
};

/** Lifecycle phase captured by a Bridge observer. */
export type TObservePhase =
  | 'dispatchStarted'
  | 'sendPrepared'
  | 'requestSent'
  | 'requestReceived'
  | 'handlePrepared'
  | 'handled'
  | 'responsePrepared'
  | 'responseSent'
  | 'responseReceived'
  | 'completed'
  | 'controlSent'
  | 'controlReceived'
  | 'failed';

/** Application or control context captured at an observation phase. */
export type TObservedMessage =
  | {
      readonly family: 'application';
      readonly kind: 'request' | 'response' | 'error';
      readonly namespace: string;
      readonly name: string;
      readonly id: string;
      readonly side: TBridgeSide;
      readonly value?: unknown;
      readonly error?: Error;
      readonly failedAt?: string;
    }
  | {
      readonly family: 'control';
      readonly kind: THandshakeMessage['type'] | 'handshake';
      readonly namespace: string;
      readonly side: TBridgeSide;
      readonly endpointId?: string;
      readonly targetEndpointId?: string;
      readonly sessionId?: string;
      readonly protocolVersion?: number;
      readonly reason?: THandshakeRejectReason;
      readonly error?: Error;
      readonly failedAt?: string;
    };

/** Middleware for Bridge application transformations and lifecycle observation. */
export type TBridgeMiddleware = {
  /** Transforms an outgoing application request before channel submission; may return a Promise. Useful for normalization. */
  onBeforeSend?(namespace: string, messageName: string, request: unknown): unknown | Promise<unknown>;
  /** Transforms a successful response before `dispatch()` resolves; may return a Promise. Useful for response normalization. */
  onAfterReceive?(namespace: string, messageName: string, response: unknown): unknown | Promise<unknown>;
  /** Transforms an admitted incoming request before its listener runs; may return a Promise. Useful for input adaptation. */
  onBeforeHandle?(namespace: string, messageName: string, request: unknown): unknown | Promise<unknown>;
  /** Transforms a listener's successful result before the response is sent; may return a Promise. Useful for output adaptation. */
  onAfterHandle?(namespace: string, messageName: string, response: unknown): unknown | Promise<unknown>;
  /** Receives application request errors synchronously on the side that observes them; useful for error logging. */
  onError?(namespace: string, messageName: string, error: Error): void;
  /** Observes captured application and handshake phases asynchronously for tracing; any returned value is ignored. */
  observe?(message: TObservedMessage, phase: TObservePhase): unknown;
};

type TMessagePayloadFromNamespace<T> =
  T extends NamespaceMessages<infer TNamespaceName, infer TMessages>
    ? {
        [K in keyof TMessages]: K extends string
          ? TMessageToSend<TNamespaceName, K, TMessages[K]['request'], TMessages[K]['meta']['direction']>
          : never;
      }[keyof TMessages]
    : never;

type TMessageResponseFromNamespace<TMessageName, Namespace> =
  Namespace extends NamespaceMessages<infer _, infer TMessages>
    ? TMessageName extends keyof TMessages
      ? TMessages[TMessageName]['response']
      : never
    : never;

type TMessageAnnotationFromNamespace<T> =
  T extends NamespaceMessages<infer TNamespaceName, infer TMessages>
    ? {
        [K in keyof TMessages]: K extends string
          ? TMessageToListen<TNamespaceName, K, TMessages[K]['meta']['direction']>
          : never;
      }[keyof TMessages]
    : never;

type TMessageCallback<T, TMessageType> = TMessageType extends { name: infer K }
  ? T extends NamespaceMessages<infer _, infer TMessages>
    ? K extends keyof TMessages
      ? (payload: TMessages[K]['request']) => TMessages[K]['response'] | Promise<TMessages[K]['response']>
      : never
    : never
  : never;

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRIES = 3;
const DEFAULT_HANDSHAKE_TIMEOUT = 10000;
const DEFAULT_HANDSHAKE_RETRY_INTERVAL = 1000;

type TTimeout = ReturnType<typeof setTimeout>;

type TResolvedBridgeConfig = {
  timeout: number;
  retries: number;
  handshake: Required<THandshakeConfig>;
};

type TPendingRequest = {
  trace: TActiveDispatchTrace;
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: TTimeout | null;
};

type TDispatchTrace = {
  id: string;
  name: string;
  value: unknown;
  kind: 'request' | 'response' | 'error';
  failedAt: string;
  isFailed: boolean;
  isCompleted: boolean;
};

type TActiveDispatchTrace = TDispatchTrace & {
  abort(error: Error): void;
};

type TIncomingHandshakeHello = Omit<THandshakeHello, 'protocolVersion'> & { protocolVersion: number };
type TIncomingHandshakeSelect = Omit<THandshakeSelect, 'protocolVersion'> & { protocolVersion: number };
type TIncomingHandshakeConnected = Omit<THandshakeConnected, 'protocolVersion'> & { protocolVersion: number };
type TIncomingHandshakeReject = Omit<THandshakeReject, 'protocolVersion'> & {
  protocolVersion: number;
};
type TIncomingHandshakeMessage =
  | TIncomingHandshakeHello
  | TIncomingHandshakeSelect
  | TIncomingHandshakeConnected
  | TIncomingHandshakeReject;
type TControlMessage = Record<string, unknown> & { family: 'control' };
type TApplicationMessageBase = Record<string, unknown> & {
  family: 'application';
  id: string;
  name: string;
  namespace: string;
  endpointId: string;
  targetEndpointId: string;
  sessionId: string;
  sender: TBridgeSide;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isBridgeSide(value: unknown): value is TBridgeSide {
  return value === 'main' || value === 'worker';
}

function isHandshakeRejectReason(value: unknown): value is THandshakeRejectReason {
  return value === 'incompatible-version' || value === 'busy' || value === 'invalid-selection';
}

function isControlMessage(message: unknown): message is TControlMessage {
  return isRecord(message) && message.family === 'control';
}

function hasHandshakeBase(message: TControlMessage): boolean {
  return (
    typeof message.protocolVersion === 'number' &&
    isNonEmptyString(message.namespace) &&
    isNonEmptyString(message.endpointId) &&
    isBridgeSide(message.sender)
  );
}

function hasHandshakeAddress(message: Record<string, unknown>): boolean {
  return isNonEmptyString(message.targetEndpointId);
}

const HANDSHAKE_MESSAGE_VALIDATORS: Record<string, (message: Record<string, unknown>) => boolean> = {
  hello: () => true,
  select: (message) => message.sender === 'main' && hasHandshakeAddress(message) && isNonEmptyString(message.sessionId),
  connected: (message) =>
    message.sender === 'worker' && hasHandshakeAddress(message) && isNonEmptyString(message.sessionId),
  reject: (message) => hasHandshakeAddress(message) && isHandshakeRejectReason(message.reason),
};

function isMessageInstance<TMessageName extends string>(
  message: unknown
): message is TMessageBase<TMessageName, TMessageName> {
  return (
    typeof message === 'object' &&
    message !== null &&
    Object.prototype.hasOwnProperty.call(message, 'namespace') &&
    Object.prototype.hasOwnProperty.call(message, 'name') &&
    Object.prototype.hasOwnProperty.call(message, 'meta')
  );
}

function isMessageForSend<Namespace extends string, TMessageName extends string>(
  message: unknown
): message is TMessageToSend<Namespace, TMessageName> {
  return isMessageInstance(message) && message.meta.type === 'forSend';
}

function isMessageForListen<Namespace extends string, TMessageName extends string>(
  message: unknown
): message is TMessageToListen<Namespace, TMessageName> {
  return isMessageInstance(message) && message.meta.type === 'forListen';
}

function isHandshakeMessage(message: unknown): message is TIncomingHandshakeMessage {
  if (!isControlMessage(message) || !hasHandshakeBase(message) || typeof message.type !== 'string') {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(HANDSHAKE_MESSAGE_VALIDATORS, message.type)) {
    return false;
  }
  const validateMessage = HANDSHAKE_MESSAGE_VALIDATORS[message.type];
  return validateMessage(message);
}

function hasApplicationBase(message: Record<string, unknown>): message is TApplicationMessageBase {
  const identifiers = [message.id, message.namespace, message.endpointId, message.targetEndpointId, message.sessionId];
  return (
    message.family === 'application' &&
    identifiers.every(isNonEmptyString) &&
    typeof message.name === 'string' &&
    isBridgeSide(message.sender)
  );
}

function isApplicationMessage(message: unknown): message is TApplicationMessage {
  if (!isRecord(message) || !hasApplicationBase(message)) {
    return false;
  }
  if (message.type === 'request' || message.type === 'response') {
    return Object.prototype.hasOwnProperty.call(message, 'data');
  }
  return message.type === 'error' && Object.prototype.hasOwnProperty.call(message, 'error');
}

function getComplementarySide(side: TBridgeSide): TBridgeSide {
  return side === 'main' ? 'worker' : 'main';
}

function namespaceMismatch(currentNamespace: string, expectedNamespace: string): string {
  return `Message namespace '${currentNamespace}' doesn't match bridge instance namespace '${expectedNamespace}'`;
}

function invalidDirection(messageName: string, messageDirection: string, bridgeSide: string): string {
  return `Cannot dispatch message '${messageName}' with direction '${messageDirection}' from '${bridgeSide}' bridge`;
}

function messageTimeout(messageName: string): string {
  return `Message timeout: ${messageName}`;
}

function handshakeRejected(reason: THandshakeRejectReason): string {
  return `Bridge handshake rejected: ${reason}`;
}

function incompatibleProtocol(version: unknown): string {
  return `Incompatible tschannel protocol version: ${String(version)}`;
}

function noHandler(messageName: string): string {
  return `No handler for message: ${messageName}`;
}

function invalidMessageType(messageType: string, expectedMethod: string): string {
  return `Message type '${messageType}, use ${expectedMethod} instead'`;
}

/** Bidirectional, namespace-scoped bridge with an explicit peer handshake. */
export class Bridge<Namespace extends NamespaceMessages, TChannel extends IChannel<TBridgeSide>> {
  /* eslint-disable @typescript-eslint/method-signature-style, @typescript-eslint/naming-convention -- Preserve the existing public uppercase error-code API. */
  static readonly ERRORS: {
    CHANNEL_NOT_READY: string;
    INVALID_MESSAGE_INSTANCE: string;
    NAMESPACE_MISMATCH: (currentNamespace: string, expectedNamespace: string) => string;
    INVALID_DIRECTION: (messageName: string, messageDirection: string, bridgeSide: string) => string;
    TIMEOUT: (messageName: string) => string;
    HANDSHAKE_TIMEOUT: string;
    HANDSHAKE_REJECTED: (reason: THandshakeRejectReason) => string;
    INCOMPATIBLE_PROTOCOL: (version: unknown) => string;
    BRIDGE_DESTROYED: string;
    NO_HANDLER: (messageName: string) => string;
    UNKNOWN: string;
    INVALID_MESSAGE_TYPE: (messageType: string, expectedMethod: string) => string;
  } = {
    CHANNEL_NOT_READY: 'Channel is not ready to send messages',
    INVALID_MESSAGE_INSTANCE: 'Message type is invalid',
    NAMESPACE_MISMATCH: namespaceMismatch,
    INVALID_DIRECTION: invalidDirection,
    TIMEOUT: messageTimeout,
    HANDSHAKE_TIMEOUT: 'Bridge handshake timeout',
    HANDSHAKE_REJECTED: handshakeRejected,
    INCOMPATIBLE_PROTOCOL: incompatibleProtocol,
    BRIDGE_DESTROYED: 'Bridge instance destroyed',
    NO_HANDLER: noHandler,
    UNKNOWN: 'Unknown error',
    INVALID_MESSAGE_TYPE: invalidMessageType,
  };
  /* eslint-enable @typescript-eslint/method-signature-style, @typescript-eslint/naming-convention */

  private readonly endpointId: TEndpointId;
  private readonly config: TResolvedBridgeConfig;
  private readonly readinessPromise: Promise<void>;
  private resolveReadiness: () => void = () => undefined;
  private rejectReadiness: (error: Error) => void = () => undefined;
  private isReadinessSettled = false;
  private isProtocolReady = false;
  private isChannelInitialized = false;
  private isDestroyed = false;
  private peerEndpointId: TEndpointId | null = null;
  private sessionId: TSessionId | null = null;
  private handshakeTimeout: TTimeout | null = null;
  private selectionRetryTimeout: TTimeout | null = null;
  private pendingRequests = new Map<string, TPendingRequest>();
  private activeDispatches = new Map<string, TActiveDispatchTrace>();
  private messageHandlers = new Map<string, (data: unknown) => Promise<unknown>>();
  private middleware: Array<TBridgeMiddleware> = [];

  constructor(
    private namespace: Namespace,
    private channel: TChannel,
    config: TBridgeConfig = {}
  ) {
    this.endpointId = generateMessageId(`${namespace.namespaceName}_${channel.side}_endpoint`);
    this.config = {
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      retries: config.retries ?? DEFAULT_RETRIES,
      handshake: {
        timeout: config.handshake?.timeout ?? DEFAULT_HANDSHAKE_TIMEOUT,
        retryInterval: config.handshake?.retryInterval ?? DEFAULT_HANDSHAKE_RETRY_INTERVAL,
      },
    };
    this.readinessPromise = new Promise<void>((resolve, reject) => {
      this.resolveReadiness = resolve;
      this.rejectReadiness = reject;
    });
    void this.readinessPromise.catch(() => undefined);
    this.channel.onMessage((message) => {
      this.handleInternalMessage(message);
    });
    void this.initializeChannel();
  }

  dispatch<TMessage extends TMessagePayloadFromNamespace<Namespace>>(
    message: TMessage
  ): Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>> {
    try {
      this.validateDispatchMessage(message);
    } catch (error) {
      return Promise.reject(this.toError(error));
    }

    const trace: TActiveDispatchTrace = {
      id: generateMessageId(this.namespace.namespaceName),
      name: message.name,
      value: message.payload,
      kind: 'request',
      failedAt: 'dispatchStarted',
      isFailed: false,
      isCompleted: false,
      abort: () => undefined,
    };
    const aborted = new Promise<never>((_resolve, reject) => {
      trace.abort = reject;
    });
    this.activeDispatches.set(trace.id, trace);
    this.observeApplication(trace, 'dispatchStarted');
    trace.failedAt = 'readiness';

    const operation = this.ready().then(() => {
      if (this.isDestroyed || !this.sessionId || !this.peerEndpointId) {
        throw new Error(Bridge.ERRORS.BRIDGE_DESTROYED);
      }
      return this.dispatchReadyMessage(message, trace);
    });
    return Promise.race([operation, aborted]).then(
      (value) => {
        this.activeDispatches.delete(trace.id);
        return value;
      },
      (error: unknown) => {
        this.failApplication(trace, this.toError(error));
        this.activeDispatches.delete(trace.id);
        throw error;
      }
    );
  }

  listen<TMessage extends TMessageAnnotationFromNamespace<Namespace>>(
    messageType: TMessage,
    handler: TMessageCallback<Namespace, TMessage>
  ): () => void {
    if (!isMessageInstance<TMessage['name']>(messageType)) {
      throw new Error(Bridge.ERRORS.INVALID_MESSAGE_INSTANCE);
    }
    if (!isMessageForListen(messageType)) {
      const messageTypeValue = (messageType as { meta?: { type?: string } }).meta?.type;
      throw new Error(Bridge.ERRORS.INVALID_MESSAGE_TYPE(messageTypeValue ?? 'unknown', '.message.%message%'));
    }
    if (messageType.namespace !== this.namespace.namespaceName) {
      throw new Error(Bridge.ERRORS.NAMESPACE_MISMATCH(messageType.namespace, this.namespace.namespaceName));
    }

    const handlerKey = `${this.namespace.namespaceName}:${messageType.name}`;
    this.messageHandlers.set(handlerKey, handler as (data: unknown) => Promise<unknown>);
    return () => {
      this.messageHandlers.delete(handlerKey);
    };
  }

  use(middleware: TBridgeMiddleware): void {
    this.middleware.push(middleware);
  }

  isReady(): boolean {
    return this.isProtocolReady && !this.isDestroyed;
  }

  ready(): Promise<void> {
    if (this.isDestroyed) {
      return Promise.reject(new Error(Bridge.ERRORS.BRIDGE_DESTROYED));
    }
    return this.readinessPromise;
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.isProtocolReady = false;
    this.clearHandshakeTimers();
    this.failReadiness(new Error(Bridge.ERRORS.BRIDGE_DESTROYED));
    this.activeDispatches.forEach((trace) => {
      const error = new Error(Bridge.ERRORS.BRIDGE_DESTROYED);
      this.failApplication(trace, error);
      trace.abort(error);
    });
    this.pendingRequests.forEach((request) => {
      if (request.timer) {
        clearTimeout(request.timer);
      }
      request.reject(new Error(Bridge.ERRORS.BRIDGE_DESTROYED));
    });
    this.pendingRequests.clear();
    this.messageHandlers.clear();
    this.middleware.length = 0;
    this.channel.destroy();
  }

  private async initializeChannel(): Promise<void> {
    try {
      await this.channel.initialize();
      if (this.isDestroyed) {
        this.channel.destroy();
        return;
      }
      this.isChannelInitialized = true;
      this.startHandshakeTimeout();
      this.sendHello();
    } catch (error) {
      this.failReadiness(this.toError(error));
    }
  }

  private startHandshakeTimeout(): void {
    this.handshakeTimeout = setTimeout(() => {
      this.failReadiness(new Error(Bridge.ERRORS.HANDSHAKE_TIMEOUT));
    }, this.config.handshake.timeout);
  }

  private sendHello(): void {
    if (this.isDestroyed || this.isProtocolReady || this.hasReadinessFailed() || !this.channel.isReady()) {
      return;
    }
    const message: THandshakeHello = {
      family: 'control',
      type: 'hello',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.namespace.namespaceName,
      endpointId: this.endpointId,
      sender: this.channel.side,
    };
    this.sendProtocolMessage(message);
  }

  private handleInternalMessage(message: TInternalMessage): void {
    if (
      this.isDestroyed ||
      !this.isChannelInitialized ||
      this.hasReadinessFailed() ||
      !isRecord(message) ||
      message.namespace !== this.namespace.namespaceName
    ) {
      return;
    }
    if (isControlMessage(message)) {
      if (isHandshakeMessage(message)) {
        this.handleHandshakeMessage(message);
      }
      return;
    }
    if (isApplicationMessage(message)) {
      this.handleApplicationMessage(message);
    }
  }

  private handleHandshakeMessage(message: TIncomingHandshakeMessage): void {
    if (message.endpointId === this.endpointId || message.sender === this.channel.side) {
      return;
    }
    if ('targetEndpointId' in message && message.targetEndpointId !== this.endpointId) {
      return;
    }
    this.observeControl(message, 'controlReceived');
    if (this.handleIncompatibleHandshakeMessage(message)) {
      return;
    }

    if (message.type === 'hello') {
      this.handleHello(message);
    } else if (message.type === 'select') {
      this.handleSelect(message);
    } else if (message.type === 'connected') {
      this.handleConnected(message);
    } else {
      this.failReadiness(new Error(Bridge.ERRORS.HANDSHAKE_REJECTED(message.reason)));
    }
  }

  private handleIncompatibleHandshakeMessage(message: TIncomingHandshakeMessage): boolean {
    if (message.protocolVersion === TSCHANNEL_PROTOCOL_VERSION) {
      return false;
    }
    if (message.type !== 'hello') {
      if (message.type !== 'reject') {
        this.sendReject(message.endpointId, 'incompatible-version');
      }
      this.failReadiness(new Error(Bridge.ERRORS.INCOMPATIBLE_PROTOCOL(message.protocolVersion)));
    }
    return true;
  }

  private handleHello(message: TIncomingHandshakeHello): void {
    if (this.isProtocolReady || message.sender !== getComplementarySide(this.channel.side)) {
      return;
    }
    if (this.channel.side === 'worker') {
      this.sendHello();
      return;
    }
    if (message.sender === 'worker' && !this.peerEndpointId) {
      this.peerEndpointId = message.endpointId;
      this.sessionId = generateMessageId(`${this.namespace.namespaceName}_session`);
      this.scheduleSelectionRetry();
      this.sendSelect();
    }
  }

  private handleSelect(message: TIncomingHandshakeSelect): void {
    if (this.channel.side !== 'worker' || message.sender !== 'main') {
      this.sendReject(message.endpointId, 'invalid-selection');
      return;
    }
    if (!this.peerEndpointId && !this.sessionId) {
      this.peerEndpointId = message.endpointId;
      this.sessionId = message.sessionId;
      this.sendConnected();
      this.completeReadiness();
      return;
    }
    if (this.peerEndpointId === message.endpointId && this.sessionId === message.sessionId) {
      this.sendConnected();
      return;
    }
    this.sendReject(message.endpointId, 'busy');
  }

  private handleConnected(message: TIncomingHandshakeConnected): void {
    if (
      this.channel.side !== 'main' ||
      message.sender !== 'worker' ||
      message.endpointId !== this.peerEndpointId ||
      message.sessionId !== this.sessionId
    ) {
      return;
    }
    this.completeReadiness();
  }

  private sendSelect(): void {
    if (!this.peerEndpointId || !this.sessionId || this.channel.side !== 'main') {
      return;
    }
    const message: THandshakeSelect = {
      family: 'control',
      type: 'select',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.namespace.namespaceName,
      endpointId: this.endpointId,
      targetEndpointId: this.peerEndpointId,
      sender: 'main',
      sessionId: this.sessionId,
    };
    this.sendProtocolMessage(message);
  }

  private sendConnected(): void {
    if (!this.peerEndpointId || !this.sessionId || this.channel.side !== 'worker') {
      return;
    }
    const message: THandshakeConnected = {
      family: 'control',
      type: 'connected',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.namespace.namespaceName,
      endpointId: this.endpointId,
      targetEndpointId: this.peerEndpointId,
      sender: 'worker',
      sessionId: this.sessionId,
    };
    this.sendProtocolMessage(message);
  }

  private sendReject(targetEndpointId: TEndpointId, reason: THandshakeRejectReason): void {
    if (!this.channel.isReady() || this.isDestroyed) {
      return;
    }
    this.sendProtocolMessage({
      family: 'control',
      type: 'reject',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.namespace.namespaceName,
      endpointId: this.endpointId,
      targetEndpointId,
      sender: this.channel.side,
      reason,
    });
  }

  private scheduleSelectionRetry(): void {
    this.clearSelectionRetry();
    this.selectionRetryTimeout = setTimeout(() => {
      if (this.isDestroyed || this.isProtocolReady || this.hasReadinessFailed() || !this.peerEndpointId) {
        return;
      }
      this.scheduleSelectionRetry();
      this.sendSelect();
    }, this.config.handshake.retryInterval);
  }

  private sendProtocolMessage(message: TInternalMessage): void {
    try {
      if (message.family === 'control') {
        this.observeControl(message, 'controlSent');
      }
      this.channel.send(message);
    } catch (error) {
      this.failReadiness(this.toError(error));
    }
  }

  private completeReadiness(): void {
    if (this.isReadinessSettled || this.isDestroyed) {
      return;
    }
    this.isReadinessSettled = true;
    this.isProtocolReady = true;
    this.clearHandshakeTimers();
    this.resolveReadiness();
  }

  private failReadiness(error: Error): void {
    if (this.isReadinessSettled) {
      return;
    }
    this.observeControlFailure(error);
    this.isReadinessSettled = true;
    this.isProtocolReady = false;
    this.clearHandshakeTimers();
    this.rejectReadiness(error);
  }

  private clearHandshakeTimers(): void {
    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = null;
    }
    this.clearSelectionRetry();
  }

  private clearSelectionRetry(): void {
    if (this.selectionRetryTimeout) {
      clearTimeout(this.selectionRetryTimeout);
      this.selectionRetryTimeout = null;
    }
  }

  private hasReadinessFailed(): boolean {
    return this.isReadinessSettled && !this.isProtocolReady;
  }

  private observeApplication(trace: TDispatchTrace, phase: TObservePhase, error?: Error): void {
    this.notifyObservers(
      {
        family: 'application',
        kind: trace.kind,
        namespace: this.namespace.namespaceName,
        name: trace.name,
        id: trace.id,
        side: this.channel.side,
        value: trace.value,
        ...(error ? { error, failedAt: trace.failedAt } : {}),
      },
      phase
    );
  }

  private failApplication(trace: TDispatchTrace, error: Error): void {
    if (trace.isFailed || trace.isCompleted) {
      return;
    }
    trace.isFailed = true;
    this.observeApplication(trace, 'failed', error);
  }

  private observeControl(message: THandshakeMessage | TIncomingHandshakeMessage, phase: TObservePhase): void {
    this.notifyObservers(
      {
        family: 'control',
        kind: message.type,
        namespace: message.namespace,
        side: this.channel.side,
        endpointId: message.endpointId,
        protocolVersion: message.protocolVersion,
        ...('targetEndpointId' in message ? { targetEndpointId: message.targetEndpointId } : {}),
        ...('sessionId' in message ? { sessionId: message.sessionId } : {}),
        ...('reason' in message ? { reason: message.reason } : {}),
      },
      phase
    );
  }

  private observeControlFailure(error: Error): void {
    this.notifyObservers(
      {
        family: 'control',
        kind: 'handshake',
        namespace: this.namespace.namespaceName,
        side: this.channel.side,
        endpointId: this.endpointId,
        error,
        failedAt: 'handshake',
      },
      'failed'
    );
  }

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

  private validateDispatchMessage<TMessage extends TMessagePayloadFromNamespace<Namespace>>(message: TMessage): void {
    if (this.isDestroyed) {
      throw new Error(Bridge.ERRORS.BRIDGE_DESTROYED);
    }
    if (!isMessageInstance<TMessage['name']>(message)) {
      throw new Error(Bridge.ERRORS.INVALID_MESSAGE_INSTANCE);
    }
    if (!isMessageForSend<Namespace['namespaceName'], TMessage['name']>(message)) {
      throw new Error(Bridge.ERRORS.INVALID_MESSAGE_TYPE(message.meta.type, '.send.%message%'));
    }
    if (message.namespace !== this.namespace.namespaceName) {
      throw new Error(Bridge.ERRORS.NAMESPACE_MISMATCH(message.namespace, this.namespace.namespaceName));
    }

    const messageDirection = message.meta.direction as TMessageDirection;
    const canSend =
      messageDirection === 'bidirectional' ||
      (this.channel.side === 'main' && messageDirection === 'mainToWorker') ||
      (this.channel.side === 'worker' && messageDirection === 'workerToMain');
    if (!canSend) {
      throw new Error(Bridge.ERRORS.INVALID_DIRECTION(message.name, messageDirection, this.channel.side));
    }
  }

  private dispatchReadyMessage<TMessage extends TMessagePayloadFromNamespace<Namespace>>(
    message: TMessage,
    trace: TActiveDispatchTrace
  ): Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>> {
    const sessionId = this.sessionId;
    const peerEndpointId = this.peerEndpointId;

    trace.failedAt = 'onBeforeSend';
    return this.applyBeforeSendMiddleware(message.name, message.payload).then((processedData) => {
      trace.value = processedData;
      trace.failedAt = 'sendPrepared';
      this.observeApplication(trace, 'sendPrepared');
      return this.submitRequest<TMessageResponseFromNamespace<TMessage['name'], Namespace>>(
        message.name,
        processedData,
        { trace, sessionId, peerEndpointId }
      );
    });
  }

  private submitRequest<Response>(
    messageName: string,
    data: unknown,
    context: { trace: TActiveDispatchTrace; sessionId: TSessionId | null; peerEndpointId: TEndpointId | null }
  ): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const { trace, sessionId, peerEndpointId } = context;
      trace.failedAt = 'channel';
      if (this.isDestroyed) {
        reject(new Error(Bridge.ERRORS.BRIDGE_DESTROYED));
        return;
      }
      if (
        !this.isProtocolReady ||
        !sessionId ||
        !peerEndpointId ||
        this.sessionId !== sessionId ||
        this.peerEndpointId !== peerEndpointId
      ) {
        reject(new Error(Bridge.ERRORS.CHANNEL_NOT_READY));
        return;
      }
      const pendingRequest = this.createPendingRequest(messageName, trace, { resolve, reject });
      this.pendingRequests.set(trace.id, pendingRequest);
      const request: TApplicationMessage = {
        family: 'application',
        id: trace.id,
        namespace: this.namespace.namespaceName,
        name: messageName,
        endpointId: this.endpointId,
        targetEndpointId: peerEndpointId,
        sessionId,
        sender: this.channel.side,
        type: 'request',
        data,
      };
      try {
        trace.failedAt = 'requestSent';
        this.observeApplication(trace, 'requestSent');
        this.channel.send(request);
      } catch (error) {
        this.pendingRequests.delete(trace.id);
        reject(this.toError(error));
        return;
      }
      this.armRequestTimeout(messageName, trace.id, pendingRequest);
    });
  }

  private armRequestTimeout(messageName: string, messageId: string, pendingRequest: TPendingRequest): void {
    if (!this.pendingRequests.has(messageId)) {
      return;
    }
    pendingRequest.timer = setTimeout(() => {
      if (this.pendingRequests.delete(messageId)) {
        pendingRequest.reject(new Error(Bridge.ERRORS.TIMEOUT(messageName)));
      }
    }, this.config.timeout);
  }

  private createPendingRequest<Response>(
    messageName: string,
    trace: TActiveDispatchTrace,
    settlement: { resolve(value: Response): void; reject(error: Error): void }
  ): TPendingRequest {
    const pendingRequest: TPendingRequest = {
      trace,
      resolve: (response: unknown) => {
        if (pendingRequest.timer) {
          clearTimeout(pendingRequest.timer);
        }
        trace.kind = 'response';
        trace.value = response;
        trace.failedAt = 'onAfterReceive';
        this.observeApplication(trace, 'responseReceived');
        this.applyAfterReceiveMiddleware(messageName, response)
          .then((finalResponse) => {
            if (trace.isFailed || this.isDestroyed) {
              settlement.reject(new Error(Bridge.ERRORS.BRIDGE_DESTROYED));
              return;
            }
            trace.value = finalResponse;
            trace.failedAt = 'completed';
            trace.isCompleted = true;
            this.observeApplication(trace, 'completed');
            settlement.resolve(finalResponse as Response);
          })
          .catch((error: unknown) => {
            settlement.reject(this.toError(error));
          });
      },
      reject: (error: Error) => {
        if (pendingRequest.timer) {
          clearTimeout(pendingRequest.timer);
        }
        this.applyErrorMiddleware(messageName, error);
        settlement.reject(error);
      },
      timer: null,
    };
    return pendingRequest;
  }

  private handleApplicationMessage(message: TApplicationMessage): void {
    if (
      !this.isProtocolReady ||
      !this.sessionId ||
      !this.peerEndpointId ||
      message.sessionId !== this.sessionId ||
      message.endpointId !== this.peerEndpointId ||
      message.targetEndpointId !== this.endpointId ||
      message.sender !== getComplementarySide(this.channel.side)
    ) {
      return;
    }

    if (message.type === 'request') {
      this.observeApplication(
        {
          id: message.id,
          name: message.name,
          value: message.data,
          kind: 'request',
          failedAt: 'requestReceived',
          isFailed: false,
          isCompleted: false,
        },
        'requestReceived'
      );
      this.handleRequest(message);
    } else if (message.type === 'response') {
      this.handleResponse(message);
    } else {
      this.handleError(message);
    }
  }

  private handleRequest(message: TApplicationMessage & { type: 'request' }): void {
    const trace: TDispatchTrace = {
      id: message.id,
      name: message.name,
      value: message.data,
      kind: 'request',
      failedAt: 'requestReceived',
      isFailed: false,
      isCompleted: false,
    };
    const handlerKey = `${message.namespace}:${message.name}`;
    const handler = this.messageHandlers.get(handlerKey);
    if (!handler) {
      const error = new Error(Bridge.ERRORS.NO_HANDLER(message.name));
      trace.failedAt = 'handler';
      this.failApplication(trace, error);
      this.sendErrorResponse(message.id, message.name, error.message);
      return;
    }

    trace.failedAt = 'onBeforeHandle';
    this.applyBeforeHandleMiddleware(message.name, message.data)
      .then((processedData) => {
        trace.value = processedData;
        trace.failedAt = 'handlePrepared';
        this.observeApplication(trace, 'handlePrepared');
        trace.failedAt = 'handler';
        return handler(processedData);
      })
      .then((response) => {
        trace.kind = 'response';
        trace.value = response;
        trace.failedAt = 'handled';
        this.observeApplication(trace, 'handled');
        trace.failedAt = 'onAfterHandle';
        return this.applyAfterHandleMiddleware(message.name, response);
      })
      .then((finalResponse) => {
        trace.value = finalResponse;
        trace.failedAt = 'responsePrepared';
        this.observeApplication(trace, 'responsePrepared');
        trace.failedAt = 'responseSent';
        this.sendResponse(message.id, message.name, finalResponse);
      })
      .catch((caught: unknown) => {
        const error = this.toError(caught);
        this.failApplication(trace, error);
        this.applyErrorMiddleware(message.name, error);
        this.sendErrorResponse(message.id, message.name, error.message || Bridge.ERRORS.UNKNOWN);
      });
  }

  private handleResponse(message: TApplicationMessage & { type: 'response' }): void {
    const pendingRequest = this.pendingRequests.get(message.id);
    if (pendingRequest) {
      pendingRequest.resolve(message.data);
      this.pendingRequests.delete(message.id);
    }
  }

  private handleError(message: TApplicationMessage & { type: 'error' }): void {
    const pendingRequest = this.pendingRequests.get(message.id);
    if (pendingRequest) {
      pendingRequest.trace.kind = 'error';
      pendingRequest.trace.value = message.error;
      pendingRequest.trace.failedAt = 'responseReceived';
      this.observeApplication(pendingRequest.trace, 'responseReceived');
      pendingRequest.reject(new Error(String(message.error)));
      this.pendingRequests.delete(message.id);
    }
  }

  private sendResponse(messageId: string, messageName: string, data: unknown): void {
    const response = this.createApplicationResponse(messageId, 'response', data);
    if (response) {
      this.observeApplication(
        {
          id: messageId,
          name: messageName,
          kind: 'response',
          value: data,
          failedAt: 'responseSent',
          isFailed: false,
          isCompleted: false,
        },
        'responseSent'
      );
      this.channel.send(response);
    }
  }

  private sendErrorResponse(messageId: string, messageName: string, error: string): void {
    const response = this.createApplicationResponse(messageId, 'error', error);
    if (response) {
      this.observeApplication(
        {
          id: messageId,
          name: messageName,
          kind: 'error',
          value: error,
          failedAt: 'responseSent',
          isFailed: false,
          isCompleted: false,
        },
        'responseSent'
      );
      this.channel.send(response);
    }
  }

  private createApplicationResponse(
    messageId: string,
    type: 'response' | 'error',
    value: unknown
  ): TApplicationMessage | null {
    if (this.isDestroyed || !this.sessionId || !this.peerEndpointId) {
      return null;
    }
    const base = {
      family: 'application' as const,
      id: messageId,
      namespace: this.namespace.namespaceName,
      name: '',
      endpointId: this.endpointId,
      targetEndpointId: this.peerEndpointId,
      sessionId: this.sessionId,
      sender: this.channel.side,
    };
    return type === 'response' ? { ...base, type: 'response', data: value } : { ...base, type: 'error', error: value };
  }

  private applyBeforeSendMiddleware(messageName: string, data: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentData) =>
          middleware.onBeforeSend
            ? middleware.onBeforeSend(this.namespace.namespaceName, messageName, currentData)
            : currentData
        ),
      Promise.resolve(data)
    );
  }

  private applyAfterReceiveMiddleware(messageName: string, response: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentResponse) =>
          middleware.onAfterReceive
            ? middleware.onAfterReceive(this.namespace.namespaceName, messageName, currentResponse)
            : currentResponse
        ),
      Promise.resolve(response)
    );
  }

  private applyBeforeHandleMiddleware(messageName: string, data: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentData) =>
          middleware.onBeforeHandle
            ? middleware.onBeforeHandle(this.namespace.namespaceName, messageName, currentData)
            : currentData
        ),
      Promise.resolve(data)
    );
  }

  private applyAfterHandleMiddleware(messageName: string, response: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (promise, middleware) =>
        promise.then((currentResponse) =>
          middleware.onAfterHandle
            ? middleware.onAfterHandle(this.namespace.namespaceName, messageName, currentResponse)
            : currentResponse
        ),
      Promise.resolve(response)
    );
  }

  private applyErrorMiddleware(messageName: string, error: Error): void {
    this.middleware.forEach((middleware) => {
      if (middleware.onError) {
        middleware.onError(this.namespace.namespaceName, messageName, error);
      }
    });
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
