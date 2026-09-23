import type { TBridgeSide, TInternalMessage, TSerializer } from './types';

/**
 * Base interface for bidirectional communication channels
 */
export interface IChannel<TSide extends TBridgeSide> {
  readonly side: TSide;

  /** Initialize connection and setup listeners */
  initialize(): Promise<void> | void;

  /** Send message through the channel */
  send(message: TInternalMessage): void;

  /** Subscribe to incoming messages */
  onMessage(handler: (message: TInternalMessage) => void): void;

  /** Check if channel is ready to send/receive messages */
  isReady(): boolean;

  /** Clean up resources */
  destroy(): void;
}

/**
 * Configuration for channels
 */
export type TChannelConfig<TSide extends TBridgeSide> = {
  side: TSide;
  serializer?: TSerializer;
};
