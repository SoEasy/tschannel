import { describe, it, expect } from 'vitest';
import { NamespaceBuilder } from './../src/builder';

// Test types for complex object scenarios
type TCreateUserRequest = {
  name: string;
  email: string;
  age?: number;
};

type TUserResponse = {
  id: string;
  createdAt: Date;
  status: 'active' | 'pending';
};

// Comprehensive test namespace covering all type scenarios
const testNamespace = new NamespaceBuilder('api')
  .bidirectionalMessage<void, void>()('ping') // void → void
  .bidirectionalMessage<string, string>()('echo') // primitive → primitive
  .bidirectionalMessage<number, number>()('double') // primitive → primitive (different type)
  .bidirectionalMessage<{ message: string }, void>()('notify') // object → void
  .bidirectionalMessage<{ userId: string }, string>()('getUserName') // object → primitive
  .bidirectionalMessage<TCreateUserRequest, TUserResponse>()('createUser') // object → object
  .build();

// Test namespace with different directions
const directionalNamespace = new NamespaceBuilder('directional')
  .mainToWorkerMessage<string, string>()('mainToWorker')
  .workerToMainMessage<string, string>()('workerToMain')
  .bidirectionalMessage<string, string>()('bidirectional')
  .build();

describe('NamespaceBuilder', () => {
  describe('Basic functionality', () => {
    it('creates builder with correct namespace name', () => {
      const builder = new NamespaceBuilder('test-namespace');
      expect(builder).toBeDefined();
    });

    it('supports fluent API for adding messages', () => {
      const result = new NamespaceBuilder('test')
        .bidirectionalMessage<string, string>()('message1')
        .bidirectionalMessage<number, void>()('message2');

      expect(result).toBeInstanceOf(NamespaceBuilder);
    });

    it('build() returns NamespaceMessages instance', () => {
      const builder = new NamespaceBuilder('test');
      const result = builder.build();

      expect(result).toBeDefined();
      expect(result.namespaceName).toBe('test');
    });

    it('adding messages does not mutate previous states', () => {
      const builder1 = new NamespaceBuilder('test').bidirectionalMessage<string, string>()('msg1');

      const builder2 = builder1.bidirectionalMessage<number, void>()('msg2');

      const ns1 = builder1.build();
      const ns2 = builder2.build();

      expect(ns1.messages).toEqual([
        { name: 'msg1', direction: 'bidirectional' },
        { name: 'msg2', direction: 'bidirectional' },
      ]);
      expect(ns2.messages).toEqual([
        { name: 'msg1', direction: 'bidirectional' },
        { name: 'msg2', direction: 'bidirectional' },
      ]);
    });
  });

  describe('Edge cases', () => {
    it('can build empty namespace without messages', () => {
      const builder = new NamespaceBuilder('empty');
      const namespace = builder.build();

      expect(namespace.namespaceName).toBe('empty');
      expect(namespace.messages).toEqual([]);
    });

    it('handles duplicate message names', () => {
      const namespace = new NamespaceBuilder('test')
        .bidirectionalMessage<string, string>()('duplicate')
        .bidirectionalMessage<number, number>()('duplicate')
        .build();

      expect(namespace.messages).toEqual([
        { name: 'duplicate', direction: 'bidirectional' },
        { name: 'duplicate', direction: 'bidirectional' },
      ]);
    });

    it('handles message names with spaces', () => {
      const namespace = new NamespaceBuilder('test')
        .bidirectionalMessage<string, string>()('user login')
        .bidirectionalMessage<number, void>()('get data')
        .build();

      const messageNames = namespace.messages.map((m) => m.name);
      expect(messageNames).toContain('user login');
      expect(messageNames).toContain('get data');
    });

    it('handles namespace names with spaces', () => {
      const builder = new NamespaceBuilder('test namespace');
      const namespace = builder.build();

      expect(namespace.namespaceName).toBe('test namespace');
    });
  });
});

describe('NamespaceMessages', () => {
  describe('Message identifiers', () => {
    it('provides correct message identifiers', () => {
      expect(testNamespace.message.ping).toEqual({
        namespace: 'api',
        name: 'ping',
        meta: {
          direction: 'bidirectional',
          type: 'forListen',
        },
      });

      expect(testNamespace.message.echo).toEqual({
        namespace: 'api',
        name: 'echo',
        meta: {
          direction: 'bidirectional',
          type: 'forListen',
        },
      });
    });

    it('message identifiers have correct meta structure', () => {
      const identifier = testNamespace.message.ping;

      expect(identifier).toHaveProperty('meta');
      expect(identifier.meta).toHaveProperty('direction');
      expect(identifier.meta).toHaveProperty('type');
      expect(identifier.meta.type).toBe('forListen');
      expect(identifier.meta.direction).toBe('bidirectional');
    });

    it('all message identifiers have forListen type', () => {
      Object.values(testNamespace.message).forEach((identifier) => {
        expect(identifier.meta.type).toBe('forListen');
      });
    });

    it('message identifiers have correct directions', () => {
      expect(directionalNamespace.message.mainToWorker.meta.direction).toBe('mainToWorker');
      expect(directionalNamespace.message.workerToMain.meta.direction).toBe('workerToMain');
      expect(directionalNamespace.message.bidirectional.meta.direction).toBe('bidirectional');
    });

    it('contains identifiers for all added messages', () => {
      const messageNames = Object.keys(testNamespace.message);
      expect(messageNames).toContain('ping');
      expect(messageNames).toContain('echo');
      expect(messageNames).toContain('double');
      expect(messageNames).toContain('notify');
      expect(messageNames).toContain('getUserName');
      expect(messageNames).toContain('createUser');
    });

    it('has correct namespace name in all identifiers', () => {
      Object.values(testNamespace.message).forEach((identifier) => {
        expect(identifier.namespace).toBe('api');
      });
    });
  });

  describe('Send methods', () => {
    it('provides send methods for all messages', () => {
      expect(typeof testNamespace.send.ping).toBe('function');
      expect(typeof testNamespace.send.echo).toBe('function');
      expect(typeof testNamespace.send.double).toBe('function');
      expect(typeof testNamespace.send.notify).toBe('function');
      expect(typeof testNamespace.send.getUserName).toBe('function');
      expect(typeof testNamespace.send.createUser).toBe('function');
    });

    it('send methods return correct message structure for void payload', () => {
      const message = testNamespace.send.ping(undefined);

      expect(message).toEqual({
        namespace: 'api',
        name: 'ping',
        payload: undefined,
        meta: {
          direction: 'bidirectional',
          type: 'forSend',
        },
      });
    });

    it('send methods return correct message structure for primitive payload', () => {
      const message = testNamespace.send.echo('test string');

      expect(message).toEqual({
        namespace: 'api',
        name: 'echo',
        payload: 'test string',
        meta: {
          direction: 'bidirectional',
          type: 'forSend',
        },
      });
    });

    it('send methods return correct message structure for object payload', () => {
      const payload = { message: 'test notification' };
      const message = testNamespace.send.notify(payload);

      expect(message).toEqual({
        namespace: 'api',
        name: 'notify',
        payload,
        meta: {
          direction: 'bidirectional',
          type: 'forSend',
        },
      });
    });

    it('send methods work with complex object types', () => {
      const userRequest: TCreateUserRequest = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      };

      const message = testNamespace.send.createUser(userRequest);

      expect(message).toEqual({
        namespace: 'api',
        name: 'createUser',
        payload: userRequest,
        meta: {
          direction: 'bidirectional',
          type: 'forSend',
        },
      });
    });

    it('send methods have correct meta structure', () => {
      const message = testNamespace.send.echo('test');

      expect(message).toHaveProperty('meta');
      expect(message.meta).toHaveProperty('direction');
      expect(message.meta).toHaveProperty('type');
      expect(message.meta.type).toBe('forSend');
      expect(message.meta.direction).toBe('bidirectional');
    });

    it('all send methods return forSend type', () => {
      const messages = [
        testNamespace.send.ping(undefined),
        testNamespace.send.echo('test'),
        testNamespace.send.double(42),
        testNamespace.send.notify({ message: 'test' }),
        testNamespace.send.getUserName({ userId: '123' }),
        testNamespace.send.createUser({ name: 'Test', email: 'test@example.com' }),
      ];

      messages.forEach((message) => {
        expect(message.meta.type).toBe('forSend');
      });
    });

    it('send methods have correct directions', () => {
      expect(directionalNamespace.send.mainToWorker('test').meta.direction).toBe('mainToWorker');
      expect(directionalNamespace.send.workerToMain('test').meta.direction).toBe('workerToMain');
      expect(directionalNamespace.send.bidirectional('test').meta.direction).toBe('bidirectional');
    });
  });
});

describe('Integration', () => {
  describe('Full workflow', () => {
    it('supports complete create → use workflow', () => {
      const ns = new NamespaceBuilder('workflow')
        .bidirectionalMessage<{ id: string }, { found: boolean }>()('search')
        .build();

      // Get message identifier for listening
      const searchIdentifier = ns.message.search;
      expect(searchIdentifier).toEqual({
        namespace: 'workflow',
        name: 'search',
        meta: {
          direction: 'bidirectional',
          type: 'forListen',
        },
      });

      // Create message for sending
      const searchMessage = ns.send.search({ id: '123' });
      expect(searchMessage).toEqual({
        namespace: 'workflow',
        name: 'search',
        payload: { id: '123' },
        meta: {
          direction: 'bidirectional',
          type: 'forSend',
        },
      });
    });

    it('supports all message type combinations', () => {
      // void → void
      const ping = testNamespace.send.ping(undefined);
      expect(ping.payload).toBeUndefined();

      // primitive → primitive
      const echo = testNamespace.send.echo('hello');
      expect(echo.payload).toBe('hello');

      // object → void
      const notify = testNamespace.send.notify({ message: 'alert' });
      expect(notify.payload).toEqual({ message: 'alert' });

      // object → primitive
      const userName = testNamespace.send.getUserName({ userId: 'user123' });
      expect(userName.payload).toEqual({ userId: 'user123' });

      // object → object
      const createUser = testNamespace.send.createUser({
        name: 'Test User',
        email: 'test@example.com',
      });
      expect(createUser.payload.name).toBe('Test User');
    });
  });

  describe('Multiple namespaces', () => {
    it('different namespaces do not interfere with each other', () => {
      const ns1 = new NamespaceBuilder('namespace1')
        .bidirectionalMessage<string, string>()('test')
        .build();

      const ns2 = new NamespaceBuilder('namespace2')
        .bidirectionalMessage<number, number>()('test')
        .build();

      expect(ns1.message.test.namespace).toBe('namespace1');
      expect(ns2.message.test.namespace).toBe('namespace2');

      const msg1 = ns1.send.test('string payload');
      const msg2 = ns2.send.test(42);

      expect(msg1.namespace).toBe('namespace1');
      expect(msg2.namespace).toBe('namespace2');
      expect(msg1.payload).toBe('string payload');
      expect(msg2.payload).toBe(42);
    });
  });
});
