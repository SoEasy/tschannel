import { describe, expect, expectTypeOf, it } from 'vitest';
import { Bridge as PackageBridge, NamespaceBuilder } from '../../src';
import { Bridge as DirectoryBridge } from '../../src/bridge';
import type {
  TBridgeConfig,
  TBridgeMiddleware,
  THandshakeConfig,
  TObservedMessage,
  TObservePhase,
} from '../../src/bridge';

const namespace = new NamespaceBuilder('entry').mainToWorkerMessage<string, string>()('ping').build();
const config: TBridgeConfig = { timeout: 25, handshake: { timeout: 50 } satisfies THandshakeConfig };
const middleware: TBridgeMiddleware = { onBeforeSend: (_namespace, _name, value) => value };
const phase: TObservePhase = 'requestSent';
const observed: TObservedMessage = {
  family: 'application',
  kind: 'request',
  namespace: 'entry',
  name: 'ping',
  id: 'id',
  side: 'main',
};

// Consumer imports and namespace-specific Bridge types remain available through both entry points.
type TPackageBridge = typeof PackageBridge<typeof namespace, import('../../src/channel').IChannel<'main'>>;
type TDirectoryBridge = typeof DirectoryBridge<typeof namespace, import('../../src/channel').IChannel<'main'>>;
const sameConstructor: TDirectoryBridge = PackageBridge as TPackageBridge;

function checkReadonlyErrorCatalog(): void {
  // @ts-expect-error Error constants are inferred as readonly literals.
  DirectoryBridge.ERRORS.BRIDGE_DESTROYED = 'replaced';
}
void checkReadonlyErrorCatalog;

describe('bridge directory entry point', () => {
  it('re-exports the established Bridge value and public type surface', () => {
    expect(DirectoryBridge).toBe(PackageBridge);
    expect(sameConstructor).toBe(PackageBridge);
    expect(config.handshake?.timeout).toBe(50);
    expect(middleware.onBeforeSend?.('entry', 'ping', 'value')).toBe('value');
    expect(phase).toBe('requestSent');
    expect(observed.kind).toBe('request');
    expect(DirectoryBridge.ERRORS).toBe(PackageBridge.ERRORS);
    expect(Object.keys(DirectoryBridge.ERRORS)).toEqual([
      'CHANNEL_NOT_READY',
      'INVALID_MESSAGE_INSTANCE',
      'NAMESPACE_MISMATCH',
      'INVALID_DIRECTION',
      'TIMEOUT',
      'HANDSHAKE_TIMEOUT',
      'HANDSHAKE_REJECTED',
      'INCOMPATIBLE_PROTOCOL',
      'BRIDGE_DESTROYED',
      'NO_HANDLER',
      'UNKNOWN',
      'INVALID_MESSAGE_TYPE',
    ]);
    expect(DirectoryBridge.ERRORS.BRIDGE_DESTROYED).toBe('Bridge instance destroyed');
    expect(DirectoryBridge.ERRORS.TIMEOUT('ping')).toBe('Message timeout: ping');
    expectTypeOf(DirectoryBridge.ERRORS.BRIDGE_DESTROYED).toEqualTypeOf<'Bridge instance destroyed'>();
    expectTypeOf(DirectoryBridge.ERRORS.TIMEOUT).toEqualTypeOf<(messageName: string) => string>();
  });
});
