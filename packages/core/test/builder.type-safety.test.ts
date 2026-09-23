/**
 * Type safety tests for NamespaceBuilder
 * These tests use @ts-expect-error to verify compile-time type checking
 * and ensure that the Builder API provides strong type guarantees
 */

import { describe, it, expectTypeOf } from 'vitest';
import { NamespaceBuilder } from '../src/builder';

describe('Builder Type Safety', () => {
  describe('Message directions', () => {
    it('mainToWorker messages have correct direction type', () => {
      const ns = new NamespaceBuilder('test')
        .mainToWorkerMessage<string, number>()('calculate')
        .build();

      const msg = ns.send.calculate('test');
      expectTypeOf(msg.meta.direction).toEqualTypeOf<'mainToWorker'>();

      // @ts-expect-error - workerToMain direction not assignable to mainToWorker
      const wrongDirection: 'workerToMain' = msg.meta.direction;
    });

    it('workerToMain messages have correct direction type', () => {
      const ns = new NamespaceBuilder('test')
        .workerToMainMessage<string, number>()('report')
        .build();

      const msg = ns.send.report('data');
      expectTypeOf(msg.meta.direction).toEqualTypeOf<'workerToMain'>();

      // @ts-expect-error - mainToWorker direction not assignable to workerToMain
      const wrongDirection: 'mainToWorker' = msg.meta.direction;
    });

    it('bidirectional messages have correct direction type', () => {
      const ns = new NamespaceBuilder('test')
        .bidirectionalMessage<string, number>()('sync')
        .build();

      const msg = ns.send.sync('data');
      expectTypeOf(msg.meta.direction).toEqualTypeOf<'bidirectional'>();

      // @ts-expect-error - mainToWorker not assignable to bidirectional
      const wrongDirection1: 'mainToWorker' = msg.meta.direction;

      // @ts-expect-error - workerToMain not assignable to bidirectional
      const wrongDirection2: 'workerToMain' = msg.meta.direction;
    });

    it('different direction types are not compatible', () => {
      const ns1 = new NamespaceBuilder('test1').mainToWorkerMessage<void, void>()('msg1').build();

      const ns2 = new NamespaceBuilder('test2').workerToMainMessage<void, void>()('msg2').build();

      const msg1 = ns1.send.msg1(undefined);
      const msg2 = ns2.send.msg2(undefined);

      // @ts-expect-error - different direction types
      const wrongAssignment: typeof msg2 = msg1;
    });
  });

  describe('Payload types', () => {
    const ns = new NamespaceBuilder('api')
      .bidirectionalMessage<{ id: number }, { name: string }>()('getUser')
      .bidirectionalMessage<string, void>()('log')
      .bidirectionalMessage<void, number>()('getCount')
      .build();

    it('rejects wrong primitive request type', () => {
      // @ts-expect-error - expected string, got number
      ns.send.log(123);

      // @ts-expect-error - expected void, got string
      ns.send.getCount('something');
    });

    it('rejects wrong object request type', () => {
      // @ts-expect-error - expected { id: number }, got string
      ns.send.getUser('wrong type');

      // @ts-expect-error - expected { id: number }, got { id: string }
      ns.send.getUser({ id: 'string' });

      // @ts-expect-error - expected { id: number }, got { name: string }
      ns.send.getUser({ name: 'John' });
    });

    it('requires all mandatory fields in request object', () => {
      type TComplexRequest = {
        userId: string;
        action: 'create' | 'update';
        data: { name: string; age: number };
      };

      const ns2 = new NamespaceBuilder('complex')
        .bidirectionalMessage<TComplexRequest, void>()('process')
        .build();

      // @ts-expect-error - missing 'action' field
      ns2.send.process({ userId: '123', data: { name: 'John', age: 30 } });

      // @ts-expect-error - missing 'data' field
      ns2.send.process({ userId: '123', action: 'create' });

      ns2.send.process({
        userId: '123',
        action: 'create',
        // @ts-expect-error - missing 'age' in data
        data: { name: 'John' },
      });
    });

    it('enforces literal types in request', () => {
      type TRequest = {
        action: 'create' | 'update' | 'delete';
      };

      const ns2 = new NamespaceBuilder('literal')
        .bidirectionalMessage<TRequest, void>()('action')
        .build();

      // @ts-expect-error - 'invalid' is not assignable to 'create' | 'update' | 'delete'
      ns2.send.action({ action: 'invalid' });

      const action: string = 'create';
      // @ts-expect-error - string is not assignable to literal union
      ns2.send.action({ action });
    });

    it('payload type is correctly inferred', () => {
      const msg = ns.send.getUser({ id: 1 });

      expectTypeOf(msg.payload).toEqualTypeOf<{ id: number }>();

      // @ts-expect-error - payload should be { id: number }, not string
      const wrongPayload: string = msg.payload;

      // @ts-expect-error - payload should be { id: number }, not { id: string }
      const wrongPayloadType: { id: string } = msg.payload;
    });

    it('void payload is strictly undefined', () => {
      const msg = ns.send.getCount(undefined);

      expectTypeOf(msg.payload).toEqualTypeOf<undefined>(undefined);

      // @ts-expect-error - void payload cannot be null
      const wrongVoid: null = msg.payload;
    });
  });

  describe('Namespace isolation', () => {
    const ns1 = new NamespaceBuilder('users')
      .bidirectionalMessage<{ id: string }, { name: string }>()('get')
      .build();

    const ns2 = new NamespaceBuilder('posts')
      .bidirectionalMessage<{ id: number }, { title: string }>()('get')
      .build();

    it('messages from different namespaces are not compatible', () => {
      // @ts-expect-error - namespace mismatch: 'users' vs 'posts'
      const wrongNamespace: typeof ns2.message.get = ns1.message.get;
    });

    it('send results from different namespaces are not compatible', () => {
      const msg1 = ns1.send.get({ id: 'user-123' });
      const msg2 = ns2.send.get({ id: 456 });

      // @ts-expect-error - different payload types and namespaces
      const wrongMessage: typeof msg2 = msg1;
    });

    it('namespace name is part of message identifier type', () => {
      expectTypeOf(ns1.message.get.namespace).toEqualTypeOf<'users'>();
      expectTypeOf(ns2.message.get.namespace).toEqualTypeOf<'posts'>();

      // @ts-expect-error - wrong namespace literal type
      const wrong1: 'posts' = ns1.message.get.namespace;

      // @ts-expect-error - wrong namespace literal type
      const wrong2: 'users' = ns2.message.get.namespace;
    });

    it('namespace name is part of send result type', () => {
      const msg1 = ns1.send.get({ id: 'user-123' });
      const msg2 = ns2.send.get({ id: 456 });

      expectTypeOf(msg1.namespace).toEqualTypeOf<'users'>();
      expectTypeOf(msg2.namespace).toEqualTypeOf<'posts'>();

      // @ts-expect-error - wrong namespace in message
      const wrongNs1: 'posts' = msg1.namespace;

      // @ts-expect-error - wrong namespace in message
      const wrongNs2: 'users' = msg2.namespace;
    });
  });

  describe('Message names', () => {
    const ns = new NamespaceBuilder('api')
      .bidirectionalMessage<void, void>()('ping')
      .bidirectionalMessage<string, string>()('echo')
      .build();

    it('message names are literal types in identifiers', () => {
      expectTypeOf(ns.message.ping.name).toEqualTypeOf<'ping'>();
      expectTypeOf(ns.message.echo.name).toEqualTypeOf<'echo'>();

      // @ts-expect-error - 'ping' is not assignable to 'echo'
      const wrongName1: 'echo' = ns.message.ping.name;

      // @ts-expect-error - 'echo' is not assignable to 'ping'
      const wrongName2: 'ping' = ns.message.echo.name;
    });

    it('message names are literal types in send results', () => {
      const msg1 = ns.send.ping(undefined);
      const msg2 = ns.send.echo('test');

      expectTypeOf(msg1.name).toEqualTypeOf<'ping'>();
      expectTypeOf(msg2.name).toEqualTypeOf<'echo'>();

      // @ts-expect-error - wrong message name type
      const wrongName: 'echo' = msg1.name;
    });

    it('cannot access non-existent messages', () => {
      // @ts-expect-error - Property 'nonexistent' does not exist
      ns.message.nonexistent;

      // @ts-expect-error - Property 'nonexistent' does not exist
      ns.send.nonexistent;

      // @ts-expect-error - Property 'unknown' does not exist
      ns.message.unknown;
    });

    it('message keys are correctly typed', () => {
      type MessageKeys = keyof typeof ns.message;
      expectTypeOf<MessageKeys>().toEqualTypeOf<'ping' | 'echo'>();

      type SendKeys = keyof typeof ns.send;
      expectTypeOf<SendKeys>().toEqualTypeOf<'ping' | 'echo'>();

      // @ts-expect-error - 'unknown' is not a valid message key
      const invalidKey: MessageKeys = 'unknown';
    });
  });

  describe('Builder immutability', () => {
    it('each builder step returns new type', () => {
      const builder1 = new NamespaceBuilder('test');
      const builder2 = builder1.bidirectionalMessage<string, number>()('msg1');
      const builder3 = builder2.bidirectionalMessage<boolean, void>()('msg2');

      const ns1 = builder1.build();
      const ns2 = builder2.build();
      const ns3 = builder3.build();

      // builder1 should not have msg1
      // @ts-expect-error - msg1 not defined on empty builder
      ns1.message.msg1;

      // builder2 has msg1
      expectTypeOf(ns2.message).toHaveProperty('msg1');

      // builder2 should not have msg2
      // @ts-expect-error - msg2 not defined on builder2
      ns2.message.msg2;

      // builder3 has both
      expectTypeOf(ns3.message).toHaveProperty('msg1');
      expectTypeOf(ns3.message).toHaveProperty('msg2');
    });

    it('adding messages preserves previous message types', () => {
      const ns = new NamespaceBuilder('test')
        .bidirectionalMessage<string, number>()('first')
        .bidirectionalMessage<boolean, string>()('second')
        .build();

      // First message should still have correct types
      const msg1 = ns.send.first('test');
      expectTypeOf(msg1.payload).toEqualTypeOf<string>();

      // @ts-expect-error - first message payload is string, not boolean
      ns.send.first(true);

      // Second message should have its own types
      const msg2 = ns.send.second(true);
      expectTypeOf(msg2.payload).toEqualTypeOf<boolean>();

      // @ts-expect-error - second message payload is boolean, not string
      ns.send.second('test');
    });

    it('different builder instances have independent types', () => {
      const builder1 = new NamespaceBuilder('ns1').bidirectionalMessage<string, void>()('msg1');

      const builder2 = new NamespaceBuilder('ns2').bidirectionalMessage<number, void>()('msg2');

      const ns1 = builder1.build();
      const ns2 = builder2.build();

      // @ts-expect-error - ns1 doesn't have msg2
      ns1.message.msg2;

      // @ts-expect-error - ns2 doesn't have msg1
      ns2.message.msg1;

      // @ts-expect-error - different namespaces
      const wrongNs: typeof ns2 = ns1;
    });
  });

  describe('Complex generics', () => {
    it('supports nested generic types', () => {
      type TRequest<T> = { data: T; meta: { timestamp: number } };
      type TResponse<T> = { result: T; status: 'ok' | 'error' };

      const ns = new NamespaceBuilder('generic')
        .bidirectionalMessage<TRequest<string[]>, TResponse<number>>()('process')
        .build();

      // @ts-expect-error - data should be string[], not string
      ns.send.process({ data: 'wrong', meta: { timestamp: Date.now() } });

      // @ts-expect-error - missing meta field
      ns.send.process({ data: ['correct'] });

      // @ts-expect-error - timestamp should be number, not string
      ns.send.process({ data: ['correct'], meta: { timestamp: '123' } });
    });

    it('supports union types in request', () => {
      type TUnionRequest = { type: 'create'; name: string } | { type: 'delete'; id: number };

      const ns = new NamespaceBuilder('union')
        .bidirectionalMessage<TUnionRequest, void>()('action')
        .build();

      // @ts-expect-error - invalid discriminant value
      ns.send.action({ type: 'update', name: 'test' });

      // @ts-expect-error - 'name' not valid for 'delete' type
      ns.send.action({ type: 'delete', name: 'test' });

      // @ts-expect-error - 'id' not valid for 'create' type
      ns.send.action({ type: 'create', id: 123 });
    });

    it('supports optional fields correctly', () => {
      type TOptionalRequest = {
        required: string;
        optional?: number;
      };

      const ns = new NamespaceBuilder('optional')
        .bidirectionalMessage<TOptionalRequest, void>()('send')
        .build();

      // @ts-expect-error - missing required field
      ns.send.send({ optional: 123 });

      // @ts-expect-error - empty object missing required field
      ns.send.send({});

      // ✅ This should work (optional can be omitted) - no @ts-expect-error
      ns.send.send({ required: 'test' });
    });

    it('supports array types', () => {
      type TArrayRequest = {
        items: Array<{ id: string; value: number }>;
      };

      const ns = new NamespaceBuilder('array')
        .bidirectionalMessage<TArrayRequest, void>()('bulk')
        .build();

      // @ts-expect-error - items should be array, not object
      ns.send.bulk({ items: { id: 'test', value: 1 } });

      // @ts-expect-error - array items should have correct shape
      ns.send.bulk({ items: [{ id: 123, value: 1 }] });

      // @ts-expect-error - missing 'value' field in array items
      ns.send.bulk({ items: [{ id: 'test' }] });
    });
  });

  describe('Readonly enforcement', () => {
    const ns = new NamespaceBuilder('test').bidirectionalMessage<string, number>()('calc').build();

    it('namespace name is readonly', () => {
      // @ts-expect-error - Cannot assign to 'namespaceName' because it is a read-only property
      ns.namespaceName = 'changed';
    });

    it('message identifier namespace is readonly', () => {
      // @ts-expect-error - Cannot assign to 'namespace' because it is a read-only property
      ns.message.calc.namespace = 'changed';
    });

    it('message identifier name is readonly', () => {
      // @ts-expect-error - Cannot assign to 'name' because it is a read-only property
      ns.message.calc.name = 'changed';
    });

    it('send result properties are readonly', () => {
      const msg = ns.send.calc('test');

      // @ts-expect-error - Cannot assign to 'namespace' because it is a read-only property
      msg.namespace = 'changed';

      // @ts-expect-error - Cannot assign to 'name' because it is a read-only property
      msg.name = 'changed';

      // @ts-expect-error - Cannot assign to 'payload' because it is a read-only property
      msg.payload = 'new value';
    });
  });

  describe('void vs undefined edge cases', () => {
    const ns = new NamespaceBuilder('void-test')
      .bidirectionalMessage<void, void>()('noPayload')
      .bidirectionalMessage<undefined, string>()('explicitUndefined')
      .bidirectionalMessage<null, string>()('explicitNull')
      .build();

    it('void requires undefined argument', () => {
      // ✅ Correct - no @ts-expect-error
      ns.send.noPayload(undefined);

      // @ts-expect-error - void doesn't accept null
      ns.send.noPayload(null);

      // @ts-expect-error - void doesn't accept empty object
      ns.send.noPayload({});

      // @ts-expect-error - void doesn't accept any value
      ns.send.noPayload('something');
    });

    it('undefined type is explicit and distinct', () => {
      // ✅ Correct - no @ts-expect-error
      ns.send.explicitUndefined(undefined);

      // @ts-expect-error - undefined doesn't accept null
      ns.send.explicitUndefined(null);
    });

    it('null type is explicit and distinct', () => {
      // ✅ Correct - no @ts-expect-error
      ns.send.explicitNull(null);

      // @ts-expect-error - null doesn't accept undefined
      ns.send.explicitNull(undefined);

      // @ts-expect-error - null doesn't accept other values
      ns.send.explicitNull('something');
    });

    it('void, undefined, and null are not interchangeable', () => {
      const msg1 = ns.send.noPayload(undefined);
      const msg2 = ns.send.explicitUndefined(undefined);
      const msg3 = ns.send.explicitNull(null);

      expectTypeOf(msg1.payload).toEqualTypeOf<undefined>(undefined);
      expectTypeOf(msg2.payload).toEqualTypeOf<undefined>(undefined);
      expectTypeOf(msg3.payload).toEqualTypeOf<null>(null);

      // @ts-expect-error - void message not assignable to null message
      const wrong1: typeof msg3 = msg1;

      // @ts-expect-error - undefined message not assignable to null message
      const wrong2: typeof msg3 = msg2;
    });
  });
});
