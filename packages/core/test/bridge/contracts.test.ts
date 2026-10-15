import { describe, expect, expectTypeOf, it } from 'vitest';
import { NamespaceBuilder } from '../../src/builder';
import type {
  IMessageShapeGuard,
  IMessaging,
  IMiddlewarePipeline,
  IProtocolSession,
  TSessionSnapshot,
  TWellFormedShape,
} from '../../src/bridge/contracts';

const namespace = new NamespaceBuilder('contracts').mainToWorkerMessage<string, number>()('count').build();

describe('Bridge collaborator contracts', () => {
  it('narrows a structurally valid frame without assuming protocol compatibility', () => {
    const value: unknown = {
      family: 'control',
      type: 'hello',
      protocolVersion: 99,
      namespace: 'test',
      endpointId: 'peer',
      sender: 'worker',
    };
    const guard: IMessageShapeGuard = {
      isCorrectShape: (candidate): candidate is TWellFormedShape =>
        typeof candidate === 'object' && candidate !== null && 'family' in candidate,
    };

    if (!guard.isCorrectShape(value)) {
      throw new Error('Expected the example frame to satisfy the guard contract');
    }
    expectTypeOf(value).toEqualTypeOf<TWellFormedShape>();
    if (value.family !== 'control') {
      throw new Error('Expected a control frame');
    }
    expectTypeOf(value.protocolVersion).toEqualTypeOf<number>();
    expect(value.protocolVersion).toBe(99);
  });

  it('keeps readiness, session snapshots, and middleware results explicit', () => {
    expectTypeOf<ReturnType<IProtocolSession['ready']>>().toEqualTypeOf<Promise<void>>();
    expectTypeOf<ReturnType<IProtocolSession['current']>>().toEqualTypeOf<TSessionSnapshot | null>();
    expectTypeOf<ReturnType<IMiddlewarePipeline['beforeSend']>>().toEqualTypeOf<Promise<unknown>>();
    expectTypeOf<ReturnType<IMiddlewarePipeline['afterReceive']>>().toEqualTypeOf<Promise<unknown>>();
    expectTypeOf<ReturnType<IMessaging<typeof namespace>['dispatch']>>().toEqualTypeOf<Promise<number>>();
    expectTypeOf<IMessaging<typeof namespace>['listen']>().toBeFunction();
    expectTypeOf<Parameters<IMessaging<typeof namespace>['accept']>[0]['family']>().toEqualTypeOf<'application'>();
  });
});
