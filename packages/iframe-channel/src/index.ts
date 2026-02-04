import {
  DEFAULT_SERIALIZER,
  type IChannel,
  type TChannelConfig,
  type TInternalMessage,
  type TSerializer,
  type TBridgeSide,
} from '@tschannel/core';

/**
 * Configuration specific to IframeChannel
 */
export type TIframeChannelConfig<TSide extends TBridgeSide> = TChannelConfig<TSide> & {
  /**
   * Iframe element to communicate with (required for 'main' side only)
   * The channel will automatically extract contentWindow from this element
   */
  iframe?: HTMLIFrameElement;

  /**
   * Target origin for postMessage security
   * - Use specific origin like 'https://example.com' for production
   * - Use '*' only for development (security risk!)
   * @default '*'
   */
  targetOrigin?: string;

  /**
   * Expected origin of incoming messages for validation
   * - Set to specific origin for security
   * - Leave undefined to accept from any origin (not recommended for production)
   */
  expectedOrigin?: string;

  /**
   * If true - channel won`t send console messages
   */
  silent?: boolean;
};

/**
 * Channel for iframe communication using postMessage API
 *
 * This channel enables bidirectional communication between parent window and iframe
 * using the standard postMessage API. The channel automatically determines the target
 * window based on the side configuration.
 *
 * Security considerations:
 * - Always specify targetOrigin in production (not '*')
 * - Always validate expectedOrigin for incoming messages
 * - Be cautious with deserialization of untrusted data
 *
 * Use cases:
 * - Parent-to-iframe communication
 * - Iframe-to-parent communication
 * - Cross-origin secure messaging
 * - Embedded widget communication
 *
 * @example
 * ```typescript
 * // In parent window
 * const iframe = document.getElementById('my-iframe') as HTMLIFrameElement;
 * const channel = new IframeChannel({
 *   side: 'main',
 *   iframe: iframe,
 *   targetOrigin: 'https://child-domain.com',
 *   expectedOrigin: 'https://child-domain.com'
 * });
 *
 * const bridge = new Bridge(namespace, channel);
 *
 * // In iframe (child)
 * const channel = new IframeChannel({
 *   side: 'worker',
 *   targetOrigin: 'https://parent-domain.com',
 *   expectedOrigin: 'https://parent-domain.com'
 * });
 *
 * const bridge = new Bridge(namespace, channel);
 * ```
 */
export class IframeChannel<TSide extends TBridgeSide> implements IChannel<TSide> {
  readonly side: TSide;
  private messageHandler?: (message: TInternalMessage) => void;
  private isInitialized = false;
  private serializer: TSerializer;
  private boundHandleMessage: (event: MessageEvent) => void;
  private readonly targetOrigin: string;
  private readonly expectedOrigin?: string;
  private readonly targetWindow: Window;
  private readonly silent: boolean;

  /**
   * Creates a new IframeChannel instance
   *
   * The channel automatically determines the target window based on the side:
   * - 'main' side: Uses iframe.contentWindow (iframe element required in config)
   * - 'worker' side: Uses window.parent automatically
   *
   * @param config - Iframe channel configuration
   * @throws Error if side is 'main' but iframe element is not provided
   * @throws Error if side is 'main' but iframe.contentWindow is not available
   */
  constructor(config: TIframeChannelConfig<TSide>) {
    this.side = config.side;
    this.serializer = config.serializer || DEFAULT_SERIALIZER;
    this.targetOrigin = config.targetOrigin || '*';
    this.expectedOrigin = config.expectedOrigin;
    this.silent = config.silent || false;
    this.boundHandleMessage = this.handleMessage.bind(this);

    // Determine target window based on side
    if (config.side === 'main') {
      // Parent side: need iframe element
      if (!config.iframe) {
        throw new Error('IframeChannel: iframe element is required for main side');
      }
      if (!config.iframe.contentWindow) {
        throw new Error('IframeChannel: iframe.contentWindow is not available');
      }
      this.targetWindow = config.iframe.contentWindow;
    } else {
      // Worker side: use window.parent
      this.targetWindow = window.parent;
    }
  }

  /**
   * Initialize the channel and start listening for messages
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    window.addEventListener('message', this.boundHandleMessage);
    this.isInitialized = true;
  }

  /**
   * Send a message through the channel via postMessage
   *
   * @param message - Internal message to send
   * @throws Error if channel is not ready
   */
  send(message: TInternalMessage): void {
    if (!this.isReady()) {
      throw new Error('IframeChannel is not ready');
    }

    const serialized = this.serializer.serialize(message);
    this.targetWindow.postMessage(serialized, this.targetOrigin);
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
      window.removeEventListener('message', this.boundHandleMessage);
    }

    this.messageHandler = undefined;
    this.isInitialized = false;
  }

  /**
   * Handle incoming postMessage events
   *
   * @param event - MessageEvent from postMessage
   */
  private handleMessage(event: MessageEvent): void {
    // Validate origin if expectedOrigin is specified
    if (this.expectedOrigin && event.origin !== this.expectedOrigin) {
      if (!this.silent) {
        console.warn(
          `IframeChannel: Rejected message from unexpected origin. Expected: ${this.expectedOrigin}, Got: ${event.origin}`
        );
      }
      return;
    }

    // Ensure we have a message handler
    if (!this.messageHandler) {
      return;
    }

    try {
      const deserialized = this.serializer.deserialize(event.data);
      this.messageHandler(deserialized);
    } catch (error) {
      if (!this.silent) {
        console.error('IframeChannel: Failed to deserialize message', error);
      }
    }
  }
}
