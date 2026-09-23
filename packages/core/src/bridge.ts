import type { NamespaceMessages, TMessageBase, TMessageToListen, TMessageToSend } from './builder';
import type { IChannel } from './channel';
import type { TBridgeSide, TInternalMessage, TMessageDirection } from './types';
import { generateMessageId } from './utils';

/**
 * Configuration for Bridge
 */
export type TBridgeConfig = {
  timeout?: number;
  retries?: number;
};

/**
 * Middleware for Bridge message processing
 */
export type TBridgeMiddleware = {
  // Outgoing messages (dispatch)
  onBeforeSend?(
    namespace: string,
    messageName: string,
    request: unknown
  ): unknown | Promise<unknown>;
  onAfterReceive?(
    namespace: string,
    messageName: string,
    response: unknown
  ): unknown | Promise<unknown>;

  // Incoming messages (listen)
  onBeforeHandle?(
    namespace: string,
    messageName: string,
    request: unknown
  ): unknown | Promise<unknown>;
  onAfterHandle?(
    namespace: string,
    messageName: string,
    response: unknown
  ): unknown | Promise<unknown>;

  // Common
  onError?(namespace: string, messageName: string, error: Error): void;
};

type TMessagePayloadFromNamespace<T> =
  T extends NamespaceMessages<infer TNamespaceName, infer TMessages>
    ? {
        [K in keyof TMessages]: K extends string
          ? TMessageToSend<
              TNamespaceName,
              K,
              TMessages[K]['request'],
              TMessages[K]['meta']['direction']
            >
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
          : 'WRONG 2';
      }[keyof TMessages]
    : '__message_doesnt_extends_namespace_messages__';

type TMessageCallback<T, TMessageType> = TMessageType extends { name: infer K }
  ? T extends NamespaceMessages<infer _, infer TMessages>
    ? K extends keyof TMessages
      ? (
          payload: TMessages[K]['request']
        ) => TMessages[K]['response'] | Promise<TMessages[K]['response']>
      : '__message_not_from_namespace__'
    : '__invalid_namespace_passed__'
  : '__invalid_message_passed__';

const DEFAULT_TIMEOUT = 10000;
const DEFAULT_RETRIES = 3;

type TTimeout = ReturnType<typeof setTimeout>;

function isMessageInstance<TMessageName extends string>(
  message: unknown
): message is TMessageBase<TMessageName, TMessageName> {
  return (
    typeof message === 'object' &&
    message !== null &&
    message.hasOwnProperty('namespace') &&
    message.hasOwnProperty('name') &&
    message.hasOwnProperty('meta')
  );
}

function isMessageForSend<Namespace extends string, TMessageName extends string>(
  message: unknown
): message is TMessageToSend<Namespace, TMessageName> {
  return (
    isMessageInstance(message) && message.hasOwnProperty('meta') && message.meta.type === 'forSend'
  );
}

function isMessageForListen<Namespace extends string, TMessageName extends string>(
  message: unknown
): message is TMessageToListen<Namespace, TMessageName> {
  return (
    isMessageInstance(message) &&
    message.hasOwnProperty('meta') &&
    message.meta.type === 'forListen'
  );
}

/**
 * Bridge - bidirectional communication between two points
 * Combines functionality of sending messages (dispatch) and handling incoming messages (listen)
 */
export class Bridge<Namespace extends NamespaceMessages, TChannel extends IChannel<TBridgeSide>> {
  static readonly ERRORS = {
    CHANNEL_NOT_READY: 'Channel is not ready to send messages',
    INVALID_MESSAGE_INSTANCE: 'Message type is invalid',
    NAMESPACE_MISMATCH: (currentNs: string, expectedNs: string): string => {
      return `Message namespace '${currentNs}' doesn't match bridge instance namespace '${expectedNs}'`;
    },
    INVALID_DIRECTION: (
      messageName: string,
      messageDirection: string,
      bridgeSide: string
    ): string => {
      return `Cannot dispatch message '${messageName}' with direction '${messageDirection}' from '${bridgeSide}' bridge`;
    },
    TIMEOUT: (messageName: string): string => `Message timeout: ${messageName}`,
    BRIDGE_DESTROYED: 'Bridge instance destroyed',
    NO_HANDLER: (messageName: string): string => `No handler for message: ${messageName}`,
    UNKNOWN: 'Unknown error',
    INVALID_MESSAGE_TYPE: (messageType: string, expectedMethod: string): string =>
      `Message type '${messageType}, use ${expectedMethod} instead'`,
  };

  private pendingRequests = new Map<
    string,
    { resolve(value: unknown): void; reject(error: Error): void; timer: TTimeout }
  >();
  private messageHandlers = new Map<string, (data: unknown) => Promise<unknown>>();
  private middleware: Array<TBridgeMiddleware> = [];
  private config: Required<TBridgeConfig>;

  constructor(
    private namespace: Namespace,
    private channel: TChannel,
    config: TBridgeConfig = {}
  ) {
    this.config = {
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      retries: config.retries ?? DEFAULT_RETRIES,
    };

    void this.initializeChannel();
  }

  /**
   * Dispatch a message and wait for response
   * message: TChannel extends IChannel<TBridgeSide>
   *       ? TMessage['meta']['direction'] extends `${TBridgeSide}To${infer _}` | 'bidirectional'
   *         ? TMessage
   *         : `__cant_send_message_with_direction_"${TMessage['meta']['direction']}"_from_"${TBridgeSide}"_bridge__`
   *       : '__invalid_bridge_channel__'
   */
  dispatch<TMessage extends TMessagePayloadFromNamespace<Namespace>>(
    message: TMessage
  ): Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>> {
    return new Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>>(
      (resolve, reject) => {
        if (!this.channel.isReady()) {
          reject(new Error(Bridge.ERRORS.CHANNEL_NOT_READY));
          return;
        }

        if (!isMessageInstance<TMessage['name']>(message)) {
          reject(new Error(Bridge.ERRORS.INVALID_MESSAGE_INSTANCE));
          return;
        }

        if (!isMessageForSend<Namespace['namespaceName'], TMessage['name']>(message)) {
          reject(Bridge.ERRORS.INVALID_MESSAGE_TYPE(message.meta.type, '.send.%message%'));
          return;
        }

        if (message.namespace !== this.namespace.namespaceName) {
          reject(
            new Error(
              Bridge.ERRORS.NAMESPACE_MISMATCH(message.namespace, this.namespace.namespaceName)
            )
          );
          return;
        }

        // Validate message direction
        const bridgeSide = this.channel.side;
        const messageDirection: TMessageDirection = message.meta.direction;

        // Check if message can be sent from this bridge side
        const canSend =
          messageDirection === 'bidirectional' ||
          (bridgeSide === 'main' && messageDirection === 'mainToWorker') ||
          (bridgeSide === 'worker' && messageDirection === 'workerToMain');

        if (!canSend) {
          reject(
            new Error(Bridge.ERRORS.INVALID_DIRECTION(message.name, messageDirection, bridgeSide))
          );
          return;
        }

        const messageId = generateMessageId(this.namespace.namespaceName);

        // Apply onBeforeSend middleware
        this.applyBeforeSendMiddleware(message.name, message.payload)
          .then((processedData) => {
            const internalMessage: TInternalMessage = {
              id: messageId,
              namespace: this.namespace.namespaceName,
              name: message.name,
              sender: this.channel.side,
              type: 'request',
              data: processedData,
            };

            // Set timeout
            const timer = setTimeout(() => {
              if (this.pendingRequests.has(messageId)) {
                const error = new Error(Bridge.ERRORS.TIMEOUT(message.name));
                this.pendingRequests.get(messageId)!.reject(error);
                this.pendingRequests.delete(messageId);
              }
            }, this.config.timeout);

            this.pendingRequests.set(messageId, {
              resolve: (response: unknown) => {
                clearTimeout(timer);
                this.applyAfterReceiveMiddleware(message.name, response)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .then(resolve as (response: unknown) => void)
                  .catch(reject);
              },
              reject: (error: Error) => {
                clearTimeout(timer);
                this.applyErrorMiddleware(message.name, error);
                reject(error);
              },
              timer,
            });

            this.channel.send(internalMessage);
          })
          .catch(reject);
      }
    );
  }

  /**
   * Register a handler for a specific message type
   */
  listen<TMessage extends TMessageAnnotationFromNamespace<Namespace>>(
    messageType: TMessage,
    handler: TMessageCallback<Namespace, TMessage>
  ): () => void {
    if (!isMessageInstance<TMessage['name']>(messageType)) {
      throw new Error(Bridge.ERRORS.INVALID_MESSAGE_INSTANCE);
    }

    if (!isMessageForListen(messageType)) {
      const msgType = (messageType as any).meta?.type || 'unknown';
      throw new Error(Bridge.ERRORS.INVALID_MESSAGE_TYPE(msgType, '.message.%message%'));
    }

    if (messageType.namespace !== this.namespace.namespaceName) {
      throw new Error(
        Bridge.ERRORS.NAMESPACE_MISMATCH(messageType.namespace, this.namespace.namespaceName)
      );
    }

    const handlerKey = `${this.namespace.namespaceName}:${messageType.name}`;
    this.messageHandlers.set(handlerKey, handler as (data: unknown) => Promise<unknown>);

    return () => {
      this.messageHandlers.delete(handlerKey);
    };
  }

  /**
   * Add middleware for message processing
   */
  use(middleware: TBridgeMiddleware): void {
    this.middleware.push(middleware);
  }

  /**
   * Check if bridge is ready to send/receive messages
   */
  isReady(): boolean {
    return this.channel.isReady();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.pendingRequests.forEach((request) => {
      clearTimeout(request.timer);
      request.reject(new Error(Bridge.ERRORS.BRIDGE_DESTROYED));
    });
    this.pendingRequests.clear();
    this.messageHandlers.clear();
    this.middleware.length = 0;
    this.channel.destroy();
  }

  private async initializeChannel(): Promise<void> {
    await this.channel.initialize();
    this.channel.onMessage(this.handleInternalMessage.bind(this));
  }

  private handleInternalMessage(message: TInternalMessage): void {
    // Filter out messages sent by this bridge instance
    if (message.sender === this.channel.side) {
      return;
    }

    if (message.type === 'request') {
      this.handleRequest(message);
    } else if (message.type === 'response') {
      this.handleResponse(message);
    } else if (message.type === 'error') {
      this.handleError(message);
    }
  }

  private handleRequest(message: TInternalMessage): void {
    const handlerKey = `${message.namespace}:${message.name}`;
    const handler = this.messageHandlers.get(handlerKey);

    if (!handler) {
      this.sendErrorResponse(message.id, Bridge.ERRORS.NO_HANDLER(message.name));
      return;
    }

    if (message.type !== 'request') {
      this.sendErrorResponse(
        message.id,
        `Invalid message type: ${message.type} for message "${message.namespace}:${message.name}" in handleRequest`
      );
      return;
    }

    // Apply onBeforeHandle middleware
    this.applyBeforeHandleMiddleware(message.name, message.data)
      .then((processedData) => handler(processedData))
      .then((response) => this.applyAfterHandleMiddleware(message.name, response))
      .then((finalResponse) => {
        this.sendResponse(message.id, finalResponse);
      })
      .catch((error: Error) => {
        this.applyErrorMiddleware(message.name, error);
        this.sendErrorResponse(message.id, error.message || Bridge.ERRORS.UNKNOWN);
      });
  }

  private handleResponse(message: TInternalMessage): void {
    const pendingRequest = this.pendingRequests.get(message.id);
    if (pendingRequest) {
      pendingRequest.resolve(message.type === 'response' ? message.data : undefined);
      this.pendingRequests.delete(message.id);
    }
  }

  private handleError(message: TInternalMessage): void {
    const pendingRequest = this.pendingRequests.get(message.id);
    if (pendingRequest) {
      pendingRequest.reject(
        new Error(String(message.type === 'error' ? message.error : Bridge.ERRORS.UNKNOWN))
      );
      this.pendingRequests.delete(message.id);
    }
  }

  private sendResponse(messageId: string, data: unknown): void {
    const response: TInternalMessage = {
      id: messageId,
      namespace: this.namespace.namespaceName,
      name: '',
      sender: this.channel.side,
      type: 'response',
      data,
    };
    this.channel.send(response);
  }

  private sendErrorResponse(messageId: string, error: string): void {
    const response: TInternalMessage = {
      id: messageId,
      namespace: this.namespace.namespaceName,
      name: '',
      sender: this.channel.side,
      type: 'error',
      error,
    };
    this.channel.send(response);
  }

  private applyBeforeSendMiddleware(messageName: string, data: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (accPromise, middleware) =>
        accPromise.then((currentData) => {
          if (middleware.onBeforeSend) {
            const result = middleware.onBeforeSend(
              this.namespace.namespaceName,
              messageName,
              currentData
            );
            return result instanceof Promise ? result : Promise.resolve(result);
          }
          return currentData;
        }),
      Promise.resolve(data)
    );
  }

  private applyAfterReceiveMiddleware(messageName: string, response: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (accPromise, middleware) =>
        accPromise.then((currentResponse) => {
          if (middleware.onAfterReceive) {
            const result = middleware.onAfterReceive(
              this.namespace.namespaceName,
              messageName,
              currentResponse
            );
            return result instanceof Promise ? result : Promise.resolve(result);
          }
          return currentResponse;
        }),
      Promise.resolve(response)
    );
  }

  private applyBeforeHandleMiddleware(messageName: string, data: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (accPromise, middleware) =>
        accPromise.then((currentData) => {
          if (middleware.onBeforeHandle) {
            const result = middleware.onBeforeHandle(
              this.namespace.namespaceName,
              messageName,
              currentData
            );
            return result instanceof Promise ? result : Promise.resolve(result);
          }
          return currentData;
        }),
      Promise.resolve(data)
    );
  }

  private applyAfterHandleMiddleware(messageName: string, response: unknown): Promise<unknown> {
    return this.middleware.reduce(
      (accPromise, middleware) =>
        accPromise.then((currentResponse) => {
          if (middleware.onAfterHandle) {
            const result = middleware.onAfterHandle(
              this.namespace.namespaceName,
              messageName,
              currentResponse
            );
            return result instanceof Promise ? result : Promise.resolve(result);
          }
          return currentResponse;
        }),
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
}
