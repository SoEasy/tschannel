// Core types and interfaces
export type {
  TApplicationMessage,
  TEndpointId,
  THandshakeConnected,
  THandshakeHello,
  THandshakeMessage,
  THandshakeReject,
  THandshakeRejectReason,
  THandshakeSelect,
  TInternalMessage,
  TProtocolMessageBase,
  TProtocolVersion,
  TSerializer,
  TSessionId,
} from './types';
export { DEFAULT_SERIALIZER, TSCHANNEL_PROTOCOL_VERSION } from './types';

// Channel interface (for implementing channels in other packages)
export type { IChannel, TChannelConfig } from './channel';

// Builder
export { NamespaceBuilder, NamespaceMessages } from './builder';
export type { TMessageDirection, TBridgeSide } from './types';

// Bridge
export { Bridge } from './bridge';
export type { TBridgeConfig, TBridgeMiddleware, THandshakeConfig, TObservedMessage, TObservePhase } from './bridge';

// Utils
export { generateMessageId } from './utils';
