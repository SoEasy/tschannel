export type TBridgeSide = 'main' | 'worker';
export type TMessageDirection = 'mainToWorker' | 'workerToMain' | 'bidirectional';
export type TMessageObjectType = 'forListen' | 'forSend';

/**
 * Internal message type for communication between bridge actors
 */
export type TInternalMessage = {
  id: string;
  namespace: string;
  name: string;
  sender: TBridgeSide;
} & (
  | { type: 'request'; data: unknown }
  | { type: 'response'; data: unknown }
  | { type: 'error'; error: unknown }
);

/**
 * Serialization interface for message transformation
 */
export type TSerializer = {
  serialize(message: TInternalMessage): unknown;
  deserialize(data: unknown): TInternalMessage;
};

/**
 * Default serializer (pass-through, no transformation)
 */
export const DEFAULT_SERIALIZER: TSerializer = {
  serialize: (message: TInternalMessage) => message,
  deserialize: (data: unknown) => data as TInternalMessage,
};
