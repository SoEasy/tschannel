/**
 * Owns the channel and routes validated incoming frames to the protocol session or messaging facade.
 * Keeps the established public Bridge API while coordinating collaborator teardown.
 */
import type { NamespaceMessages } from '../builder';
import type { IChannel } from '../channel';
import type { TBridgeSide, TInternalMessage } from '../types';
import {
  BRIDGE_ERRORS,
  type TBridgeConfig,
  type TBridgeMiddleware,
  type TMessageAnnotationFromNamespace,
  type TMessageCallback,
  type TMessagePayloadFromNamespace,
  type TMessageResponseFromNamespace,
  type TResolvedBridgeConfig,
  toError,
} from './contracts';
import { Messaging } from './messaging';
import { MiddlewarePipeline } from './middleware';
import { ProtocolSession } from './session';
import { MessageShapeGuard } from './shape-guard';

/** Default application response deadline in milliseconds. */
const DEFAULT_TIMEOUT = 10000;
/** Retained default for the public retries setting. */
const DEFAULT_RETRIES = 3;
/** Default deadline for selecting a peer session. */
const DEFAULT_HANDSHAKE_TIMEOUT = 10000;
/** Delay between retries of an addressed SELECT frame. */
const DEFAULT_HANDSHAKE_RETRY_INTERVAL = 1000;

/** Bidirectional, namespace-scoped bridge with an explicit peer handshake. */
export class Bridge<Namespace extends NamespaceMessages, TChannel extends IChannel<TBridgeSide>> {
  /** Public error catalog shared with the internal collaborators. */
  static readonly ERRORS = BRIDGE_ERRORS;

  /** Effective timing settings after public defaults are applied. */
  private readonly config: TResolvedBridgeConfig;

  /** Owns peer selection, session admission, and readiness. */
  private readonly session: ProtocolSession;

  /** Blocks ingress until the local channel has completed initialization. */
  private isChannelInitialized = false;

  /** Prevents work and repeated teardown after destroy(). */
  private isDestroyed = false;

  /** Owns application listeners and in-flight requests. */
  private readonly messaging: Messaging<Namespace>;

  /** Runs shared transformations, error hooks, and observers. */
  private readonly middlewarePipeline: MiddlewarePipeline;

  /** Rejects malformed or unknown incoming frames before routing. */
  private readonly shapeGuard = new MessageShapeGuard();

  /** Wires collaborators and registers ingress before starting the channel. */
  constructor(
    /** Namespace definition used for typed public calls and ingress isolation. */
    private namespace: Namespace,
    /** Sole transport owner; collaborators receive only send callbacks. */
    private channel: TChannel,
    config: TBridgeConfig = {}
  ) {
    this.config = {
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      retries: config.retries ?? DEFAULT_RETRIES,
      handshake: {
        timeout: config.handshake?.timeout ?? DEFAULT_HANDSHAKE_TIMEOUT,
        retryInterval: config.handshake?.retryInterval ?? DEFAULT_HANDSHAKE_RETRY_INTERVAL,
      },
    };
    this.middlewarePipeline = new MiddlewarePipeline(namespace.namespaceName, channel.side);
    this.session = new ProtocolSession({
      namespace: namespace.namespaceName,
      side: channel.side,
      handshake: this.config.handshake,
      isChannelReady: (): boolean => channel.isReady(),
      send: (message): void => {
        channel.send(message);
      },
      middleware: this.middlewarePipeline,
    });
    this.messaging = new Messaging(namespace, {
      side: channel.side,
      timeout: this.config.timeout,
      session: this.session,
      middleware: this.middlewarePipeline,
      send: (message): void => {
        channel.send(message);
      },
    });
    this.channel.onMessage((message) => {
      this.handleInternalMessage(message);
    });
    void this.initializeChannel();
  }

  /** Delegates a typed request to messaging after protocol readiness. */
  dispatch<TMessage extends TMessagePayloadFromNamespace<Namespace>>(
    message: TMessage
  ): Promise<TMessageResponseFromNamespace<TMessage['name'], Namespace>> {
    return this.messaging.dispatch(message);
  }

  /** Registers a typed application handler and returns its unsubscribe function. */
  listen<TMessage extends TMessageAnnotationFromNamespace<Namespace>>(
    messageType: TMessage,
    handler: TMessageCallback<Namespace, TMessage>
  ): () => void {
    return this.messaging.listen(messageType, handler);
  }

  /** Appends middleware to the shared application and observation pipeline. */
  use(middleware: TBridgeMiddleware): void {
    this.middlewarePipeline.use(middleware);
  }

  /** Reports negotiated session readiness, not transport readiness. */
  isReady(): boolean {
    return this.session.isReady();
  }

  /** Waits for the handshake or its terminal failure. */
  ready(): Promise<void> {
    return this.session.ready();
  }

  /** Stops protocol and application work before closing the channel. */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    const error = new Error(Bridge.ERRORS.BRIDGE_DESTROYED);
    this.session.destroy(error);
    this.messaging.destroy(error);
    this.middlewarePipeline.clear();
    this.channel.destroy();
  }

  /** Starts negotiation only after local initialization and cleans up late completion. */
  private async initializeChannel(): Promise<void> {
    try {
      await this.channel.initialize();
      if (this.isDestroyed) {
        this.channel.destroy();
        return;
      }
      this.isChannelInitialized = true;
      this.session.start();
    } catch (error) {
      this.session.fail(toError(error));
    }
  }

  /** Routes well-shaped, namespace-matching frames through session admission. */
  private handleInternalMessage(message: TInternalMessage): void {
    if (
      this.isDestroyed ||
      !this.isChannelInitialized ||
      this.session.hasReadinessFailed() ||
      !this.shapeGuard.isCorrectShape(message) ||
      message.namespace !== this.namespace.namespaceName
    ) {
      return;
    }
    if (message.family === 'control') {
      this.session.accept(message);
    } else if (this.session.admits(message)) {
      this.messaging.accept(message);
    }
  }
}
