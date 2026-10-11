import type { TBridgeSide, TInternalMessage, TSerializer } from './types';

/**
 * Base interface for bidirectional communication channels
 */
export interface IChannel<TSide extends TBridgeSide> {
  readonly side: TSide;

  /** Initialize the local transport after the incoming handler has been registered */
  initialize(): Promise<void> | void;

  /** Send message through the channel */
  send(message: TInternalMessage): void;

  /** Register the incoming handler; this must be supported before initialize() */
  onMessage(handler: (message: TInternalMessage) => void): void;

  /** Check if the local transport is ready to send/receive protocol envelopes */
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
