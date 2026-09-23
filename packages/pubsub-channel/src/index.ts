import {
  type IChannel,
  type TChannelConfig,
  type TInternalMessage,
  type TSerializer,
  type TBridgeSide,
  DEFAULT_SERIALIZER,
} from '@tschannel/core';

/**
 * Configuration specific to PubSubChannel
 */
export type TPubSubChannelConfig<TSide extends TBridgeSide> = TChannelConfig<TSide> & {
  /**
   * Optional custom EventTarget for pub/sub communication
   * If not provided, uses a shared global EventTarget
   * Useful for isolating communication between different bridge pairs
   */
  eventBus?: EventTarget;
};

/**
 * Channel for pub/sub communication within the same context
 *
 * This channel allows bidirectional communication within a single thread/context
 * using the EventTarget API and CustomEvent for message passing.
 *
 * The channel automatically uses a shared EventTarget for communication between
 * main and worker sides. You can optionally provide a custom EventTarget for
 * isolated communication scenarios.
 *
 * Use cases:
 * - Testing bridge communication without actual cross-context setup
 * - In-memory communication between different parts of the application
 * - Mock channel for development and debugging
 *
 * @example
 * ```typescript
 * // Simple usage with automatic shared EventTarget
 * const mainChannel = new PubSubChannel({ side: 'main' });
 * const workerChannel = new PubSubChannel({ side: 'worker' });
 *
 * const bridgeA = new Bridge(namespace, mainChannel);
 * const bridgeB = new Bridge(namespace, workerChannel);
 *
 * // Custom EventTarget for isolated communication
 * const customBus = new EventTarget();
 * const channelA = new PubSubChannel({ side: 'main', eventBus: customBus });
 * const channelB = new PubSubChannel({ side: 'worker', eventBus: customBus });
 * ```
 */
export class PubSubChannel<TSide extends TBridgeSide> implements IChannel<TSide> {
  readonly side: TSide;
  private messageHandler?: (message: TInternalMessage) => void;
  private isInitialized = false;
  private serializer: TSerializer;
  private boundHandleEvent: (event: Event) => void;
  private readonly eventTarget: EventTarget;

  // Shared global EventTarget for default communication
  private static globalEventBus: EventTarget | null = null;

  /**
   * Get or create the global EventTarget for pub/sub communication
   */
  private static getGlobalEventBus(): EventTarget {
    if (!PubSubChannel.globalEventBus) {
      PubSubChannel.globalEventBus = new EventTarget();
    }
    return PubSubChannel.globalEventBus;
  }

  /**
   * Creates a new PubSubChannel instance
   *
   * The channel uses a shared EventTarget for communication:
   * - If eventBus is provided in config, uses that
   * - Otherwise, uses a global shared EventTarget
   *
   * This allows both main and worker channels to communicate automatically
   * without explicitly managing the EventTarget.
   *
   * @param config - PubSub channel configuration
   */
  constructor(private config: TPubSubChannelConfig<TSide>) {
    this.side = config.side;
    this.serializer = config.serializer || DEFAULT_SERIALIZER;
    this.boundHandleEvent = this.handleCustomEvent.bind(this);

    // Use provided eventBus or fallback to global shared one
    this.eventTarget = config.eventBus || PubSubChannel.getGlobalEventBus();
  }

  /**
   * Initialize the channel and start listening for messages
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    this.eventTarget.addEventListener('bridge-message', this.boundHandleEvent);
    this.isInitialized = true;
  }

  /**
   * Send a message through the channel
   *
   * @param message - Internal message to send
   * @throws Error if channel is not ready
   */
  send(message: TInternalMessage): void {
    if (!this.isReady()) {
      throw new Error('PubSubChannel is not ready');
    }

    const serialized = this.serializer.serialize(message);
    const event = new CustomEvent('bridge-message', { detail: serialized });
    this.eventTarget.dispatchEvent(event);
  }

  /**
   * Register a handler for incoming messages
   *
   * @param handler - Function to call when a message is received
   */
  onMessage(handler: (message: TInternalMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Check if the channel is ready to send/receive messages
   *
   * @returns true if channel is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Clean up resources and stop listening for messages
   */
  destroy(): void {
    if (this.isInitialized) {
      this.eventTarget.removeEventListener('bridge-message', this.boundHandleEvent);
    }

    this.messageHandler = undefined;
    this.isInitialized = false;
  }

  /**
   * Handle incoming CustomEvent messages
   *
   * @param event - CustomEvent with message data
   */
  private handleCustomEvent(event: Event): void {
    if (!this.messageHandler || !(event instanceof CustomEvent)) {
      return;
    }

    const deserialized = this.serializer.deserialize(event.detail);
    this.messageHandler(deserialized);
  }

  /**
   * Reset the global event bus (useful for testing)
   * @internal
   */
  static resetGlobalEventBus(): void {
    PubSubChannel.globalEventBus = null;
  }
}
