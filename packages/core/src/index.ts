// Core types and interfaces
export type { TInternalMessage, TSerializer } from './types';
export { DEFAULT_SERIALIZER } from './types';

// Channel interface (for implementing channels in other packages)
export type { IChannel, TChannelConfig } from './channel';

// Builder
export { NamespaceBuilder, NamespaceMessages } from './builder';
export type { TMessageDirection, TBridgeSide } from './types';

// Bridge
export { Bridge } from './bridge';
export type { TBridgeConfig, TBridgeMiddleware } from './bridge';

// Utils
export { generateMessageId } from './utils';
