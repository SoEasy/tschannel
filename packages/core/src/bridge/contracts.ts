/**
 * Defines Bridge configuration, message types, errors, and private collaborator contracts.
 * Only the established Bridge-facing types are re-exported by this package.
 */
import type { NamespaceMessages, TMessageToListen, TMessageToSend } from '../builder';
import type {
  TApplicationMessage,
  TBridgeSide,
  TEndpointId,
  THandshakeConnected,
  THandshakeHello,
  THandshakeMessage,
  THandshakeReject,
  THandshakeRejectReason,
  THandshakeSelect,
  TSessionId,
} from '../types';

/** Controls how long a peer has to confirm a session and how often SELECT is retried. */
export type THandshakeConfig = {
  /** Maximum time in milliseconds to finish the handshake. */
  timeout?: number;

  /** Delay in milliseconds between addressed SELECT retries. */
  retryInterval?: number;
};

/** Configuration for Bridge. */
export type TBridgeConfig = {
  /** Maximum time in milliseconds to wait for an application response. */
  timeout?: number;

  /** Reserved application retry setting retained for API compatibility. */
  retries?: number;

  /** Timing policy for peer negotiation. */
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
      /** Distinguishes application observations from control observations. */
      readonly family: 'application';

      /** Request or settlement event represented by this snapshot. */
      readonly kind: 'request' | 'response' | 'error';

      /** Namespace that owns the observed request. */
      readonly namespace: string;

      /** Application message name within the namespace. */
      readonly name: string;

      /** Correlation ID shared by a request and its response. */
      readonly id: string;

      /** Local side on which the phase was observed. */
      readonly side: TBridgeSide;

      /** Payload or response captured at this phase, when available. */
      readonly value?: unknown;

      /** Failure reported by the pipeline, when this is a failed phase. */
      readonly error?: Error;

      /** Stage at which the failure occurred. */
      readonly failedAt?: string;
    }
  | {
      /** Distinguishes protocol observations from application observations. */
      readonly family: 'control';

      /** Control frame type, or handshake for a local protocol failure. */
      readonly kind: THandshakeMessage['type'] | 'handshake';

      /** Namespace used to select the peer session. */
      readonly namespace: string;

      /** Local side on which the control phase was observed. */
      readonly side: TBridgeSide;

      /** Sender endpoint, or local endpoint for a handshake failure. */
      readonly endpointId?: string;

      /** Intended recipient for addressed control frames. */
      readonly targetEndpointId?: string;

      /** Session selected by an addressed frame. */
      readonly sessionId?: string;

      /** Version carried by a received or sent control frame. */
      readonly protocolVersion?: number;

      /** Reason carried by a REJECT frame. */
      readonly reason?: THandshakeRejectReason;

      /** Local handshake failure, when this is a failed phase. */
      readonly error?: Error;

      /** Protocol stage at which the failure occurred. */
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

/** Maps a built namespace to the union of messages accepted by dispatch(). */
export type TMessagePayloadFromNamespace<T> =
  T extends NamespaceMessages<infer TNamespaceName, infer TMessages>
    ? {
        [K in keyof TMessages]: K extends string
          ? TMessageToSend<TNamespaceName, K, TMessages[K]['request'], TMessages[K]['meta']['direction']>
          : never;
      }[keyof TMessages]
    : never;

/** Resolves a dispatch result from its message name and namespace definition. */
export type TMessageResponseFromNamespace<TMessageName, Namespace> =
  Namespace extends NamespaceMessages<infer _, infer TMessages>
    ? TMessageName extends keyof TMessages
      ? TMessages[TMessageName]['response']
      : never
    : never;

/** Maps a built namespace to the union of tokens accepted by listen(). */
export type TMessageAnnotationFromNamespace<T> =
  T extends NamespaceMessages<infer TNamespaceName, infer TMessages>
    ? {
        [K in keyof TMessages]: K extends string
          ? TMessageToListen<TNamespaceName, K, TMessages[K]['meta']['direction']>
          : never;
      }[keyof TMessages]
    : never;

/** Derives a listener's request and response types from its message token. */
export type TMessageCallback<T, TMessageType> = TMessageType extends {
  /** Message name used to select its listener signature. */
  name: infer K;
}
  ? T extends NamespaceMessages<infer _, infer TMessages>
    ? K extends keyof TMessages
      ? (payload: TMessages[K]['request']) => TMessages[K]['response'] | Promise<TMessages[K]['response']>
      : never
    : never
  : never;

/** Timer handle shared by handshake and application timeouts. */
export type TTimeout = ReturnType<typeof setTimeout>;
/** Configuration after default values have been applied by Bridge. */
export type TResolvedBridgeConfig = {
  /** Effective application response timeout in milliseconds. */
  timeout: number;

  /** Effective reserved retry count. */
  retries: number;

  /** Effective handshake timing settings. */
  handshake: Required<THandshakeConfig>;
};

/** Mutable lifecycle state for one observed application dispatch. */
export type TDispatchTrace = {
  /** Request correlation ID. */
  id: string;

  /** Application message name. */
  name: string;

  /** Value most recently exposed to middleware observation. */
  value: unknown;

  /** Whether the trace currently represents a request, response, or error. */
  kind: 'request' | 'response' | 'error';

  /** Latest stage, used to locate a terminal failure. */
  failedAt: string;

  /** Prevents duplicate failed observations. */
  isFailed: boolean;

  /** Prevents a completed trace from later being marked failed. */
  isCompleted: boolean;
};

/** A dispatch trace that can be rejected during Bridge destruction. */
export type TActiveDispatchTrace = TDispatchTrace & {
  /** Rejects the dispatch even while asynchronous middleware is pending. */
  abort(error: Error): void;
};

/** Well-shaped HELLO before protocol version compatibility is checked. */
export type TIncomingHandshakeHello = Omit<THandshakeHello, 'protocolVersion'> & {
  /** Numeric version supplied by the peer, including unsupported versions. */
  protocolVersion: number;
};
/** Well-shaped SELECT before protocol version compatibility is checked. */
export type TIncomingHandshakeSelect = Omit<THandshakeSelect, 'protocolVersion'> & {
  /** Numeric version supplied by the peer, including unsupported versions. */
  protocolVersion: number;
};
/** Well-shaped CONNECTED before protocol version compatibility is checked. */
export type TIncomingHandshakeConnected = Omit<THandshakeConnected, 'protocolVersion'> & {
  /** Numeric version supplied by the peer, including unsupported versions. */
  protocolVersion: number;
};
/** Well-shaped REJECT before protocol version compatibility is checked. */
export type TIncomingHandshakeReject = Omit<THandshakeReject, 'protocolVersion'> & {
  /** Numeric version supplied by the peer, including unsupported versions. */
  protocolVersion: number;
};
/** Any structurally valid control frame awaiting session validation. */
export type TIncomingHandshakeMessage =
  | TIncomingHandshakeHello
  | TIncomingHandshakeSelect
  | TIncomingHandshakeConnected
  | TIncomingHandshakeReject;

/** A structurally checked frame; compatibility and session ownership are still unknown. */
export type TWellFormedShape = TIncomingHandshakeMessage | TApplicationMessage;

/** Immutable view of the session selected for application messaging. */
export type TSessionSnapshot = Readonly<{
  /** Local endpoint that owns this snapshot. */
  endpointId: TEndpointId;

  /** Peer endpoint admitted to this session. */
  peerEndpointId: TEndpointId;

  /** Correlation key required on application frames. */
  sessionId: TSessionId;

  /** Namespace negotiated by both peers. */
  namespace: string;

  /** Local side used to validate sender direction. */
  side: TBridgeSide;
}>;

/** Checks only the structural shape of an incoming channel value. */
export interface IMessageShapeGuard {
  /** Narrows known frames without deciding protocol or session compatibility. */
  isCorrectShape(value: unknown): value is TWellFormedShape;
}

/** Owns peer negotiation, selected session identity, and readiness settlement. */
export interface IProtocolSession {
  /** Returns the local endpoint ID used in outbound frames. */
  localEndpointId(): TEndpointId;

  /** Begins negotiation after the local channel has initialized. */
  start(): void;

  /** Processes a structurally valid control frame from ingress. */
  accept(message: TIncomingHandshakeMessage): void;

  /** Accepts application frames only from the selected peer and session. */
  admits(message: TApplicationMessage): boolean;

  /** Returns an immutable selected-session snapshot after readiness. */
  current(): TSessionSnapshot | null;

  /** Waits for successful negotiation or its terminal failure. */
  ready(): Promise<void>;

  /** Reports acknowledged protocol readiness rather than channel readiness. */
  isReady(): boolean;

  /** Reports whether readiness has settled unsuccessfully. */
  hasReadinessFailed(): boolean;

  /** Settles readiness after a local channel or protocol failure. */
  fail(error: Error): void;

  /** Cancels protocol timers and prevents later negotiation. */
  destroy(error: Error): void;
}

/** Owns typed requests, listeners, pending responses, and application timeouts. */
export interface IMessaging<Namespace extends NamespaceMessages> {
  /** Sends a namespace-typed request after protocol readiness. */
  dispatch<TMessage extends TMessagePayloadFromNamespace<Namespace>>(
    message: TMessage
  ): Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>>;

  /** Registers a typed handler and returns its unsubscription function. */
  listen<TMessage extends TMessageAnnotationFromNamespace<Namespace>>(
    messageType: TMessage,
    handler: TMessageCallback<Namespace, TMessage>
  ): () => void;

  /** Processes an application frame already admitted by the session. */
  accept(message: TApplicationMessage): void;

  /** Rejects outstanding work and clears registered handlers. */
  destroy(error: Error): void;
}

/** Runs application transformations and reports lifecycle observations. */
export interface IMiddlewarePipeline {
  /** Appends middleware in execution order. */
  use(middleware: TBridgeMiddleware): void;

  /** Removes middleware registrations during Bridge destruction. */
  clear(): void;

  /** Applies outgoing request transformations before channel submission. */
  beforeSend(messageName: string, data: unknown): Promise<unknown>;

  /** Applies response transformations before dispatch resolves. */
  afterReceive(messageName: string, response: unknown): Promise<unknown>;

  /** Applies incoming request transformations before invoking a listener. */
  beforeHandle(messageName: string, data: unknown): Promise<unknown>;

  /** Applies listener-result transformations before sending a response. */
  afterHandle(messageName: string, response: unknown): Promise<unknown>;

  /** Notifies synchronous error hooks without transforming the error. */
  reportError(messageName: string, error: Error): void;

  /** Publishes a captured application phase to observers. */
  observeApplication(trace: TDispatchTrace, phase: TObservePhase, error?: Error): void;

  /** Publishes at most one terminal failure for an application trace. */
  failApplication(trace: TDispatchTrace, error: Error): void;

  /** Publishes a sent or received control frame to observers. */
  observeControl(message: THandshakeMessage | TIncomingHandshakeMessage, phase: TObservePhase): void;

  /** Publishes a local handshake failure without a control frame. */
  observeControlFailure(endpointId: TEndpointId, error: Error): void;
}

/** Formats a namespace mismatch using the existing public error text. */
function namespaceMismatch(currentNamespace: string, expectedNamespace: string): string {
  return `Message namespace '${currentNamespace}' doesn't match bridge instance namespace '${expectedNamespace}'`;
}

/** Formats a send rejected by the message's declared direction. */
function invalidDirection(messageName: string, messageDirection: string, bridgeSide: string): string {
  return `Cannot dispatch message '${messageName}' with direction '${messageDirection}' from '${bridgeSide}' bridge`;
}

/** Identifies the application request that exhausted its response timeout. */
function messageTimeout(messageName: string): string {
  return `Message timeout: ${messageName}`;
}

/** Formats a peer's explicit handshake rejection. */
function handshakeRejected(reason: THandshakeRejectReason): string {
  return `Bridge handshake rejected: ${reason}`;
}

/** Reports a numeric protocol version the local session does not support. */
function incompatibleProtocol(version: unknown): string {
  return `Incompatible tschannel protocol version: ${String(version)}`;
}

/** Names the request with no registered listener. */
function noHandler(messageName: string): string {
  return `No handler for message: ${messageName}`;
}

/** Directs callers to the matching builder method for the supplied token. */
function invalidMessageType(messageType: string, expectedMethod: string): string {
  return `Message type '${messageType}, use ${expectedMethod} instead'`;
}

/** Single source of truth for Bridge's public error constants and formatters. */
export const BRIDGE_ERRORS = {
  /** Local transport cannot submit a request for the selected session. */
  CHANNEL_NOT_READY: 'Channel is not ready to send messages',
  /** A dispatch or listen argument is not a builder message token. */
  INVALID_MESSAGE_INSTANCE: 'Message type is invalid',
  /** Produces an error for a message from another namespace. */
  NAMESPACE_MISMATCH: namespaceMismatch,
  /** Produces an error for a message sent from the wrong side. */
  INVALID_DIRECTION: invalidDirection,
  /** Produces an error for an unanswered application request. */
  TIMEOUT: messageTimeout,
  /** Peer negotiation did not finish before its deadline. */
  HANDSHAKE_TIMEOUT: 'Bridge handshake timeout',
  /** Produces an error from a peer's REJECT reason. */
  HANDSHAKE_REJECTED: handshakeRejected,
  /** Produces an error for an unsupported protocol version. */
  INCOMPATIBLE_PROTOCOL: incompatibleProtocol,
  /** The Bridge has stopped accepting and sending work. */
  BRIDGE_DESTROYED: 'Bridge instance destroyed',
  /** Produces an error for a request without a registered listener. */
  NO_HANDLER: noHandler,
  /** Fallback text when a remote failure has no useful message. */
  UNKNOWN: 'Unknown error',
  /** Produces an error for a builder token used with the wrong method. */
  INVALID_MESSAGE_TYPE: invalidMessageType,
} as const;

/** Converts thrown non-Error values before exposing them through Bridge failures. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
