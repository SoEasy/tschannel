/**
 * Exposes the stable Bridge class and its established public types from the bridge directory.
 * Internal collaborator contracts remain private to @tschannel/core.
 */
export { Bridge } from './bridge';
export type { TBridgeConfig, TBridgeMiddleware, THandshakeConfig, TObservedMessage, TObservePhase } from './contracts';
