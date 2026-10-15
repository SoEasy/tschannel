/**
 * Owns typed application dispatch, listeners, pending requests, and response settlement.
 * It receives only application frames admitted by the protocol session.
 */
import type { NamespaceMessages, TMessageBase, TMessageToListen, TMessageToSend } from '../builder';
import type { TApplicationMessage, TBridgeSide, TEndpointId, TMessageDirection, TSessionId } from '../types';
import { generateMessageId } from '../utils';
import {
  BRIDGE_ERRORS,
  type IMessaging,
  type IMiddlewarePipeline,
  type IProtocolSession,
  type TActiveDispatchTrace,
  type TDispatchTrace,
  type TMessageAnnotationFromNamespace,
  type TMessageCallback,
  type TMessagePayloadFromNamespace,
  type TMessageResponseFromNamespace,
  type TTimeout,
  toError,
} from './contracts';

/** Settlement and timeout state for one submitted application request. */
type TPendingRequest = {
  /** Observation state shared with the originating dispatch. */
  trace: TActiveDispatchTrace;

  /** Completes the dispatch after a successful response. */
  resolve(value: unknown): void;

  /** Fails the dispatch after a remote error, timeout, or destruction. */
  reject(error: Error): void;

  /** Response deadline, absent until the request is submitted. */
  timer: TTimeout | null;
};

/** Narrow dependencies supplied by the Bridge facade. */
type TMessagingOptions = {
  /** Local side used to validate dispatch direction. */
  side: TBridgeSide;

  /** Response deadline in milliseconds. */
  timeout: number;

  /** Readiness and selected-session source. */
  session: IProtocolSession;

  /** Application transformation and observation pipeline. */
  middleware: IMiddlewarePipeline;

  /** Submits one application frame through Bridge's channel. */
  send(message: TApplicationMessage): void;
};

/** Selection captured before outgoing middleware can yield. */
type TRequestContext = {
  /** Dispatch observation and correlation state. */
  trace: TActiveDispatchTrace;

  /** Session captured before outgoing middleware ran. */
  sessionId: TSessionId | null;

  /** Peer captured before outgoing middleware ran. */
  peerEndpointId: TEndpointId | null;
};

/** Admitted request frame handled by a registered listener. */
type TRequestMessage = Extract<
  TApplicationMessage,
  {
    /** Selects the request variant from the application union. */
    type: 'request';
  }
>;
/** Successful frame used to settle a pending dispatch. */
type TResponseMessage = Extract<
  TApplicationMessage,
  {
    /** Selects the successful response variant. */
    type: 'response';
  }
>;
/** Failure frame used to reject a pending dispatch. */
type TErrorMessage = Extract<
  TApplicationMessage,
  {
    /** Selects the error response variant. */
    type: 'error';
  }
>;

/** Checks the builder token fields shared by send and listen tokens. */
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

/** Accepts only a builder token produced for dispatch(). */
function isMessageForSend<Namespace extends string, TMessageName extends string>(
  message: unknown
): message is TMessageToSend<Namespace, TMessageName> {
  return isMessageInstance(message) && message.meta.type === 'forSend';
}

/** Accepts only a builder token produced for listen(). */
function isMessageForListen<Namespace extends string, TMessageName extends string>(
  message: unknown
): message is TMessageToListen<Namespace, TMessageName> {
  return isMessageInstance(message) && message.meta.type === 'forListen';
}

/** Owns application traffic after the protocol session admits each frame. */
export class Messaging<Namespace extends NamespaceMessages> implements IMessaging<Namespace> {
  /** Blocks new work and late asynchronous completions after teardown. */
  private isDestroyed = false;

  /** Correlates submitted request IDs with their settlement callbacks. */
  private readonly pendingRequests = new Map<string, TPendingRequest>();

  /** Tracks dispatches even before they submit a channel frame. */
  private readonly activeDispatches = new Map<string, TActiveDispatchTrace>();

  /** Routes admitted request names to the latest registered listener. */
  private readonly messageHandlers = new Map<string, (data: unknown) => Promise<unknown>>();

  /** Stores namespace typing and the narrow session, middleware, and send ports. */
  constructor(
    /** Builder definition that determines valid messages and responses. */
    private readonly namespace: Namespace,
    /** Runtime dependencies supplied by the owning Bridge. */
    private readonly options: TMessagingOptions
  ) {}

  /** Validates a send token, waits for readiness, and races work against destruction. */
  dispatch<TMessage extends TMessagePayloadFromNamespace<Namespace>>(
    message: TMessage
  ): Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>> {
    try {
      this.validateDispatchMessage(message);
    } catch (error) {
      return Promise.reject(toError(error));
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
    this.options.middleware.observeApplication(trace, 'dispatchStarted');
    trace.failedAt = 'readiness';

    const operation = this.options.session.ready().then(() => {
      if (this.isDestroyed || !this.options.session.current()) {
        throw new Error(BRIDGE_ERRORS.BRIDGE_DESTROYED);
      }
      return this.dispatchReadyMessage(message, trace);
    });
    return Promise.race([operation, aborted]).then(
      (value) => {
        this.activeDispatches.delete(trace.id);
        return value;
      },
      (error: unknown) => {
        this.options.middleware.failApplication(trace, toError(error));
        this.activeDispatches.delete(trace.id);
        throw error;
      }
    );
  }

  /** Registers one typed listener and returns a function that removes it. */
  listen<TMessage extends TMessageAnnotationFromNamespace<Namespace>>(
    messageType: TMessage,
    handler: TMessageCallback<Namespace, TMessage>
  ): () => void {
    if (!isMessageInstance<TMessage['name']>(messageType)) {
      throw new Error(BRIDGE_ERRORS.INVALID_MESSAGE_INSTANCE);
    }
    if (!isMessageForListen(messageType)) {
      const messageTypeValue = (
        messageType as {
          /** Optional metadata on an invalid runtime token. */
          meta?: {
            /** Builder token kind used to choose the guidance text. */
            type?: string;
          };
        }
      ).meta?.type;
      throw new Error(BRIDGE_ERRORS.INVALID_MESSAGE_TYPE(messageTypeValue ?? 'unknown', '.message.%message%'));
    }
    if (messageType.namespace !== this.namespace.namespaceName) {
      throw new Error(BRIDGE_ERRORS.NAMESPACE_MISMATCH(messageType.namespace, this.namespace.namespaceName));
    }

    const handlerKey = `${this.namespace.namespaceName}:${messageType.name}`;
    this.messageHandlers.set(handlerKey, handler as (data: unknown) => Promise<unknown>);
    return () => {
      this.messageHandlers.delete(handlerKey);
    };
  }

  /** Handles a response, error, or request already admitted by the session. */
  accept(message: TApplicationMessage): void {
    if (this.isDestroyed) {
      return;
    }
    this.handleApplicationMessage(message);
  }

  /** Rejects pending and pre-send dispatches, then clears handlers. */
  destroy(error: Error): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.activeDispatches.forEach((trace) => {
      const dispatchError = new Error(error.message);
      this.options.middleware.failApplication(trace, dispatchError);
      trace.abort(dispatchError);
    });
    this.pendingRequests.forEach((request) => {
      if (request.timer) {
        clearTimeout(request.timer);
      }
      request.reject(new Error(error.message));
    });
    this.pendingRequests.clear();
    this.messageHandlers.clear();
  }

  /** Rejects invalid tokens, namespaces, directions, and destroyed state. */
  private validateDispatchMessage<TMessage extends TMessagePayloadFromNamespace<Namespace>>(message: TMessage): void {
    if (this.isDestroyed) {
      throw new Error(BRIDGE_ERRORS.BRIDGE_DESTROYED);
    }
    if (!isMessageInstance<TMessage['name']>(message)) {
      throw new Error(BRIDGE_ERRORS.INVALID_MESSAGE_INSTANCE);
    }
    if (!isMessageForSend<Namespace['namespaceName'], TMessage['name']>(message)) {
      throw new Error(BRIDGE_ERRORS.INVALID_MESSAGE_TYPE(message.meta.type, '.send.%message%'));
    }
    if (message.namespace !== this.namespace.namespaceName) {
      throw new Error(BRIDGE_ERRORS.NAMESPACE_MISMATCH(message.namespace, this.namespace.namespaceName));
    }

    const messageDirection = message.meta.direction as TMessageDirection;
    const canSend =
      messageDirection === 'bidirectional' ||
      (this.options.side === 'main' && messageDirection === 'mainToWorker') ||
      (this.options.side === 'worker' && messageDirection === 'workerToMain');
    if (!canSend) {
      throw new Error(BRIDGE_ERRORS.INVALID_DIRECTION(message.name, messageDirection, this.options.side));
    }
  }

  /** Captures the selected peer before asynchronous outgoing middleware runs. */
  private dispatchReadyMessage<TMessage extends TMessagePayloadFromNamespace<Namespace>>(
    message: TMessage,
    trace: TActiveDispatchTrace
  ): Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>> {
    const session = this.options.session.current();
    const sessionId = session?.sessionId ?? null;
    const peerEndpointId = session?.peerEndpointId ?? null;

    trace.failedAt = 'onBeforeSend';
    return this.options.middleware.beforeSend(message.name, message.payload).then((processedData) => {
      trace.value = processedData;
      trace.failedAt = 'sendPrepared';
      this.options.middleware.observeApplication(trace, 'sendPrepared');
      return this.submitRequest<TMessageResponseFromNamespace<TMessage['name'], Namespace>>(
        message.name,
        processedData,
        { trace, sessionId, peerEndpointId }
      );
    });
  }

  /** Rechecks session identity and installs a pending request before send(). */
  private submitRequest<Response>(messageName: string, data: unknown, context: TRequestContext): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const { trace, sessionId, peerEndpointId } = context;
      trace.failedAt = 'channel';
      if (this.isDestroyed) {
        reject(new Error(BRIDGE_ERRORS.BRIDGE_DESTROYED));
        return;
      }
      if (
        !this.options.session.isReady() ||
        !sessionId ||
        !peerEndpointId ||
        this.options.session.current()?.sessionId !== sessionId ||
        this.options.session.current()?.peerEndpointId !== peerEndpointId
      ) {
        reject(new Error(BRIDGE_ERRORS.CHANNEL_NOT_READY));
        return;
      }
      const pendingRequest = this.createPendingRequest(messageName, trace, { resolve, reject });
      this.pendingRequests.set(trace.id, pendingRequest);
      const request: TApplicationMessage = {
        family: 'application',
        id: trace.id,
        namespace: this.namespace.namespaceName,
        name: messageName,
        endpointId: this.options.session.localEndpointId(),
        targetEndpointId: peerEndpointId,
        sessionId,
        sender: this.options.side,
        type: 'request',
        data,
      };
      try {
        trace.failedAt = 'requestSent';
        this.options.middleware.observeApplication(trace, 'requestSent');
        this.options.send(request);
      } catch (error) {
        this.pendingRequests.delete(trace.id);
        reject(toError(error));
        return;
      }
      this.armRequestTimeout(messageName, trace.id, pendingRequest);
    });
  }

  /** Starts a response deadline only if a synchronous response has not settled it. */
  private armRequestTimeout(messageName: string, messageId: string, pendingRequest: TPendingRequest): void {
    if (!this.pendingRequests.has(messageId)) {
      return;
    }
    pendingRequest.timer = setTimeout(() => {
      if (this.pendingRequests.delete(messageId)) {
        pendingRequest.reject(new Error(BRIDGE_ERRORS.TIMEOUT(messageName)));
      }
    }, this.options.timeout);
  }

  /** Builds settlement callbacks that run response middleware and clear timers. */
  private createPendingRequest<Response>(
    messageName: string,
    trace: TActiveDispatchTrace,
    settlement: {
      /** Completes the outer dispatch promise. */
      resolve(value: Response): void;

      /** Rejects the outer dispatch promise. */
      reject(error: Error): void;
    }
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
        this.options.middleware.observeApplication(trace, 'responseReceived');
        this.options.middleware
          .afterReceive(messageName, response)
          .then((finalResponse) => {
            if (trace.isFailed || this.isDestroyed) {
              settlement.reject(new Error(BRIDGE_ERRORS.BRIDGE_DESTROYED));
              return;
            }
            trace.value = finalResponse;
            trace.failedAt = 'completed';
            trace.isCompleted = true;
            this.options.middleware.observeApplication(trace, 'completed');
            settlement.resolve(finalResponse as Response);
          })
          .catch((error: unknown) => {
            settlement.reject(toError(error));
          });
      },
      reject: (error: Error) => {
        if (pendingRequest.timer) {
          clearTimeout(pendingRequest.timer);
        }
        this.options.middleware.reportError(messageName, error);
        settlement.reject(error);
      },
      timer: null,
    };
    return pendingRequest;
  }

  /** Routes an admitted application variant to its request or settlement path. */
  private handleApplicationMessage(message: TApplicationMessage): void {
    if (message.type === 'request') {
      this.options.middleware.observeApplication(
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

  /** Runs the listener pipeline and replies with a response or error. */
  private handleRequest(message: TRequestMessage): void {
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
      const error = new Error(BRIDGE_ERRORS.NO_HANDLER(message.name));
      trace.failedAt = 'handler';
      this.options.middleware.failApplication(trace, error);
      this.sendErrorResponse(message.id, message.name, error.message);
      return;
    }

    trace.failedAt = 'onBeforeHandle';
    this.options.middleware
      .beforeHandle(message.name, message.data)
      .then((processedData) => {
        trace.value = processedData;
        trace.failedAt = 'handlePrepared';
        this.options.middleware.observeApplication(trace, 'handlePrepared');
        trace.failedAt = 'handler';
        return handler(processedData);
      })
      .then((response) => {
        trace.kind = 'response';
        trace.value = response;
        trace.failedAt = 'handled';
        this.options.middleware.observeApplication(trace, 'handled');
        trace.failedAt = 'onAfterHandle';
        return this.options.middleware.afterHandle(message.name, response);
      })
      .then((finalResponse) => {
        trace.value = finalResponse;
        trace.failedAt = 'responsePrepared';
        this.options.middleware.observeApplication(trace, 'responsePrepared');
        trace.failedAt = 'responseSent';
        this.sendResponse(message.id, message.name, finalResponse);
      })
      .catch((caught: unknown) => {
        this.failRequest(message, trace, toError(caught));
      });
  }

  /** Reports a listener-side failure and sends its error response. */
  private failRequest(message: TRequestMessage, trace: TDispatchTrace, error: Error): void {
    this.options.middleware.failApplication(trace, error);
    this.options.middleware.reportError(message.name, error);
    this.sendErrorResponse(message.id, message.name, error.message || BRIDGE_ERRORS.UNKNOWN);
  }

  /** Settles the matching pending request with a successful remote value. */
  private handleResponse(message: TResponseMessage): void {
    const pendingRequest = this.pendingRequests.get(message.id);
    if (pendingRequest) {
      pendingRequest.resolve(message.data);
      this.pendingRequests.delete(message.id);
    }
  }

  /** Rejects the matching pending request with the remote error text. */
  private handleError(message: TErrorMessage): void {
    const pendingRequest = this.pendingRequests.get(message.id);
    if (pendingRequest) {
      pendingRequest.trace.kind = 'error';
      pendingRequest.trace.value = message.error;
      pendingRequest.trace.failedAt = 'responseReceived';
      this.options.middleware.observeApplication(pendingRequest.trace, 'responseReceived');
      pendingRequest.reject(new Error(String(message.error)));
      this.pendingRequests.delete(message.id);
    }
  }

  /** Observes and sends a successful listener result. */
  private sendResponse(messageId: string, messageName: string, data: unknown): void {
    const response = this.createApplicationResponse(messageId, 'response', data);
    if (response) {
      this.options.middleware.observeApplication(
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
      this.options.send(response);
    }
  }

  /** Observes and sends an application error frame. */
  private sendErrorResponse(messageId: string, messageName: string, error: string): void {
    const response = this.createApplicationResponse(messageId, 'error', error);
    if (response) {
      this.options.middleware.observeApplication(
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
      this.options.send(response);
    }
  }

  /** Addresses a response to the peer in the current ready session. */
  private createApplicationResponse(
    messageId: string,
    type: 'response' | 'error',
    value: unknown
  ): TApplicationMessage | null {
    const session = this.options.session.current();
    if (this.isDestroyed || !session) {
      return null;
    }
    const base = {
      family: 'application' as const,
      id: messageId,
      namespace: this.namespace.namespaceName,
      name: '',
      endpointId: session.endpointId,
      targetEndpointId: session.peerEndpointId,
      sessionId: session.sessionId,
      sender: this.options.side,
    };
    return type === 'response' ? { ...base, type: 'response', data: value } : { ...base, type: 'error', error: value };
  }
}
