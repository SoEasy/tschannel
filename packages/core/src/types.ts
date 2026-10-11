export type TBridgeSide = 'main' | 'worker';
export type TMessageDirection = 'mainToWorker' | 'workerToMain' | 'bidirectional';
export type TMessageObjectType = 'forListen' | 'forSend';

export const TSCHANNEL_PROTOCOL_VERSION = 1 as const;

export type TProtocolVersion = typeof TSCHANNEL_PROTOCOL_VERSION;
export type TEndpointId = string;
export type TSessionId = string;
export type THandshakeRejectReason = 'incompatible-version' | 'busy' | 'invalid-selection';

export type TProtocolMessageBase = {
  namespace: string;
  sender: TBridgeSide;
  endpointId: TEndpointId;
};

export type THandshakeHello = TProtocolMessageBase & {
  family: 'control';
  type: 'hello';
  protocolVersion: TProtocolVersion;
};

export type THandshakeSelect = TProtocolMessageBase & {
  family: 'control';
  type: 'select';
  protocolVersion: TProtocolVersion;
  sender: 'main';
  targetEndpointId: TEndpointId;
  sessionId: TSessionId;
};

export type THandshakeConnected = TProtocolMessageBase & {
  family: 'control';
  type: 'connected';
  protocolVersion: TProtocolVersion;
  sender: 'worker';
  targetEndpointId: TEndpointId;
  sessionId: TSessionId;
};

export type THandshakeReject = TProtocolMessageBase & {
  family: 'control';
  type: 'reject';
  protocolVersion: TProtocolVersion;
  targetEndpointId: TEndpointId;
  reason: THandshakeRejectReason;
};

export type THandshakeMessage = THandshakeHello | THandshakeSelect | THandshakeConnected | THandshakeReject;

/**
 * Application message exchanged inside an established bridge session.
 */
export type TApplicationMessage = TProtocolMessageBase & {
  family: 'application';
  id: string;
  name: string;
  targetEndpointId: TEndpointId;
  sessionId: TSessionId;
} & ({ type: 'request'; data: unknown } | { type: 'response'; data: unknown } | { type: 'error'; error: unknown });

/**
 * Complete internal wire protocol carried by channels and serializers.
 */
export type TInternalMessage = TApplicationMessage | THandshakeMessage;

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
