# tschannel

Type-safe bidirectional communication library for isolated JavaScript execution contexts.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)

## Overview

**tschannel** provides a robust, type-safe messaging system for communication between isolated JavaScript environments.
Built with TypeScript, it offers full type safety for request/response patterns with a clean, intuitive API.

### Why tschannel?

Working with iframes, service workers, Chrome extensions, and other isolated JavaScript contexts often involves dealing with cumbersome `addEventListener` patterns and untyped message passing. tschannel solves this by providing:

- **Full Type Safety**: TypeScript-first design with complete type inference for messages and responses
- **Bidirectional Communication**: Both sides can send requests and handle responses
- **Transport Agnostic**: Core logic separated from transport layer via `IChannel` interface
- **Flexible Message Direction**: Define unidirectional (`main→worker`, `worker→main`) or bidirectional messages
- **Namespace-based Organization**: Group related messages into logical namespaces
- **Middleware Support**: Intercept and transform messages at any stage
- **Promise-based API**: Modern async/await friendly interface

### Supported Environments

- **Iframes** and parent windows (via `postMessage`)
- **Web Workers** and main threads (in progress)
- **Service Workers** and clients (in progress)
- **Chrome Extensions** (background/content scripts) (in progress)
- **Electron** (main/renderer processes) (in progress)
- **Any custom transport** (via `IChannel` implementation)

## Installation

```bash
# Using pnpm
pnpm add @tschannel/core @tschannel/iframe-channel

# Using npm
npm install @tschannel/core @tschannel/iframe-channel

# Using yarn
yarn add @tschannel/core @tschannel/iframe-channel
```

### Available Packages

- **[@tschannel/core](packages/core)** - Core library with Bridge, NamespaceBuilder, and types
- **[@tschannel/iframe-channel](packages/iframe-channel)** - Channel implementation for iframe communication
- **[@tschannel/pubsub-channel](packages/pubsub-channel)** - In-memory channel for testing and same-context communication

## Quick Start

### 1. Define Your Message Namespace

Create a namespace with typed messages:

```typescript
import { NamespaceBuilder } from '@tschannel/core';

type TUser = {
  id: string;
  name: string;
  email: string;
};

// Define message namespace with different directions
// Generic format: .message<TRequest, TResponse>()('messageName')
// - TRequest: Type of data sent with the message
// - TResponse: Type of data returned in response
const myNamespace = new NamespaceBuilder('myApp')
  // Main → Worker messages (parent sends to child)
  .mainToWorkerMessage<string, string>()('greet')
  .mainToWorkerMessage<{ userId: string }, TUser>()('getUserData')

  // Worker → Main messages (child sends to parent)
  .workerToMainMessage<string, void>()('notify')

  // Bidirectional messages (either side can send)
  .bidirectionalMessage<string, string>()('echo')
  .build();

export const messages = myNamespace.message;
export const send = myNamespace.send;
```

### 2. Setup Communication Channels

#### Parent Window (Main Side)

```typescript
import { Bridge } from '@tschannel/core';
import { IframeChannel } from '@tschannel/iframe-channel';
import { myNamespace, messages, send } from './namespace';

// Get iframe element
const iframe = document.getElementById('myFrame') as HTMLIFrameElement;

// Create channel
const channel = new IframeChannel({
  side: 'main',
  iframe: iframe,
  targetOrigin: 'https://child-domain.com', // Specify for security
});

// Create bridge
const bridge = new Bridge(myNamespace, channel);

// Setup message handlers
bridge.listen(messages.notify, async (message: string) => {
  console.log('Notification from iframe:', message);
});

bridge.listen(messages.echo, async (text: string) => {
  return `Parent echoes: ${text}`;
});

// Send messages to iframe
const greeting = await bridge.dispatch(send.greet('Hello from parent!'));
console.log(greeting); // Response from iframe

const user = await bridge.dispatch(send.getUserData({ userId: '123' }));
console.log(user); // { id: '123', name: 'John', email: 'john@example.com' }
```

#### Iframe (Worker Side)

```typescript
import { Bridge } from '@tschannel/core';
import { IframeChannel } from '@tschannel/iframe-channel';
import { myNamespace, messages, send } from './namespace';

// Create channel (automatically uses window.parent)
const channel = new IframeChannel({
  side: 'worker',
  targetOrigin: 'https://parent-domain.com',
});

// Create bridge
const bridge = new Bridge(myNamespace, channel);

// Setup message handlers
bridge.listen(messages.greet, async (greeting: string) => {
  console.log('Greeting from parent:', greeting);
  return 'Hello from iframe!';
});

bridge.listen(messages.getUserData, async ({ userId }: { userId: string }) => {
  // Fetch user data
  return {
    id: userId,
    name: 'John',
    email: 'john@example.com',
  };
});

bridge.listen(messages.echo, async (text: string) => {
  return `Iframe echoes: ${text}`;
});

// Send notification to parent
await bridge.dispatch(send.notify('Iframe is ready!'));
```

## Core Concepts

### 1. Namespace Builder

The `NamespaceBuilder` creates a type-safe schema for all messages in your communication:

```typescript
const namespace = new NamespaceBuilder('namespace-name')
  .mainToWorkerMessage<RequestType, ResponseType>()('messageName')
  .workerToMainMessage<RequestType, ResponseType>()('anotherMessage')
  .bidirectionalMessage<RequestType, ResponseType>()('twoWayMessage')
  .build();
```

**Message Directions:**
- `mainToWorkerMessage` - Can only be sent from main side to worker side
- `workerToMainMessage` - Can only be sent from worker side to main side
- `bidirectionalMessage` - Can be sent from either side

### 2. Channels

Channels implement the transport layer and must implement the `IChannel` interface:

```typescript
interface IChannel<TSide extends 'main' | 'worker'> {
  readonly side: TSide;
  initialize(): Promise<void> | void;
  send(message: TInternalMessage): void;
  onMessage(handler: (message: TInternalMessage) => void): void;
  isReady(): boolean;
  destroy(): void;
}
```

**Available Channels:**
- `IframeChannel` - For iframe communication via postMessage
- `PubSubChannel` - For in-memory same-context communication (testing)

### 3. Bridge

The `Bridge` class manages message sending, receiving, and routing:

```typescript
const bridge = new Bridge(namespace, channel, {
  timeout: 10000,  // Request timeout in ms (default: 10000)
  retries: 3,      // Retry attempts (default: 3)
});

// Send messages
const response = await bridge.dispatch(send.messageName(payload));

// Handle incoming messages
bridge.listen(messages.messageName, async (payload) => {
  // Process and return response
  return responseData;
});

// Add middleware
bridge.use({
  onBeforeSend: (namespace, messageName, data) => {
    console.log('Sending:', messageName, data);
    return data;
  },
  onAfterReceive: (namespace, messageName, response) => {
    console.log('Received:', messageName, response);
    return response;
  },
});
```

## Advanced Features

### Middleware

Intercept and transform messages at different lifecycle stages:

```typescript
bridge.use({
  // Before sending a request
  onBeforeSend: (namespace, messageName, request) => {
    console.log(`Sending ${messageName}:`, request);
    return request; // Can transform data
  },

  // After receiving a response
  onAfterReceive: (namespace, messageName, response) => {
    console.log(`Received response for ${messageName}:`, response);
    return response; // Can transform data
  },

  // Before handling an incoming request
  onBeforeHandle: (namespace, messageName, request) => {
    console.log(`Handling ${messageName}:`, request);
    return request; // Can transform data
  },

  // After processing and before sending response
  onAfterHandle: (namespace, messageName, response) => {
    console.log(`Responding to ${messageName}:`, response);
    return response; // Can transform data
  },

  // On any error
  onError: (namespace, messageName, error) => {
    console.error(`Error in ${messageName}:`, error);
  },
});
```

### Custom Serialization

Implement custom serialization for complex data types:

```typescript
import { TSerializer } from '@tschannel/core';

const customSerializer: TSerializer = {
  serialize: (message) => {
    // Custom serialization logic
    return JSON.stringify(message);
  },
  deserialize: (data) => {
    // Custom deserialization logic
    return JSON.parse(data as string);
  },
};

const channel = new IframeChannel({
  side: 'main',
  iframe: iframeElement,
  serializer: customSerializer,
});
```

### Creating Custom Channels

Implement the `IChannel` interface for any transport mechanism:

```typescript
import { IChannel, TInternalMessage } from '@tschannel/core';

class WebSocketChannel implements IChannel<'main'> {
  readonly side = 'main';
  private socket: WebSocket;
  private handler?: (message: TInternalMessage) => void;
  private ready = false;

  constructor(private url: string) {
    this.socket = new WebSocket(url);
  }

  async initialize(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.onopen = () => {
        this.ready = true;
        resolve();
      };

      this.socket.onmessage = (event) => {
        if (this.handler) {
          const message = JSON.parse(event.data);
          this.handler(message);
        }
      };
    });
  }

  send(message: TInternalMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  onMessage(handler: (message: TInternalMessage) => void): void {
    this.handler = handler;
  }

  isReady(): boolean {
    return this.ready;
  }

  destroy(): void {
    this.socket.close();
    this.handler = undefined;
    this.ready = false;
  }
}
```

## Examples

### Chrome Extension (Background ↔ Content Script) (in progress)

```typescript
// shared/namespace.ts
export const extensionNamespace = new NamespaceBuilder('myExtension')
  .mainToWorkerMessage<{ url: string }, { title: string }>()('getPageInfo')
  .workerToMainMessage<{ text: string }, void>()('showNotification')
  .build();

// background.ts (main)
const channel = new ChromeRuntimeChannel({ side: 'main' });
const bridge = new Bridge(extensionNamespace, channel);

bridge.listen(messages.showNotification, async ({ text }) => {
  chrome.notifications.create({ message: text });
});

// content-script.ts (worker)
const channel = new ChromeRuntimeChannel({ side: 'worker' });
const bridge = new Bridge(extensionNamespace, channel);

bridge.listen(messages.getPageInfo, async ({ url }) => {
  return { title: document.title };
});

await bridge.dispatch(send.showNotification({ text: 'Page loaded!' }));
```

### Service Worker Communication (in progress)

```typescript
// Implement ServiceWorkerChannel
class ServiceWorkerChannel implements IChannel<'main'> {
  // ... implementation
}

// In main thread
const channel = new ServiceWorkerChannel({ side: 'main' });
const bridge = new Bridge(namespace, channel);

// In service worker
const channel = new ServiceWorkerChannel({ side: 'worker' });
const bridge = new Bridge(namespace, channel);
```

## API Reference

### Core Package (@tschannel/core)

#### `NamespaceBuilder<TName>`

Builder for creating type-safe message namespaces.

**Methods:**
- `mainToWorkerMessage<TReq, TRes>()('name')` - Define main→worker message
- `workerToMainMessage<TReq, TRes>()('name')` - Define worker→main message
- `bidirectionalMessage<TReq, TRes>()('name')` - Define bidirectional message
- `build()` - Build the namespace

#### `Bridge<TNamespace, TChannel>`

Main class for managing bidirectional communication.

**Constructor:**
```typescript
new Bridge(namespace, channel, config?)
```

**Methods:**
- `dispatch(message)` - Send a message and wait for response
- `listen(messageType, handler)` - Register handler for incoming messages
- `use(middleware)` - Add middleware
- `isReady()` - Check if bridge is ready
- `destroy()` - Clean up resources

#### `IChannel<TSide>`

Interface for implementing custom transport channels.

**Required Methods:**
- `initialize()` - Setup channel
- `send(message)` - Send message through transport
- `onMessage(handler)` - Subscribe to incoming messages
- `isReady()` - Check ready state
- `destroy()` - Clean up

### Iframe Channel (@tschannel/iframe-channel)

#### `IframeChannel<TSide>`

Channel implementation for iframe communication.

**Constructor:**
```typescript
new IframeChannel({
  side: 'main' | 'worker',
  iframe?: HTMLIFrameElement,        // Required for 'main' side
  targetOrigin?: string,              // Security: specify allowed origin
  expectedOrigin?: string,            // Security: validate incoming origin
  serializer?: TSerializer,
})
```

### PubSub Channel (@tschannel/pubsub-channel)

#### `PubSubChannel<TSide>`

In-memory channel for same-context communication.

**Constructor:**
```typescript
new PubSubChannel({
  side: 'main' | 'worker',
  eventBus?: EventTarget,             // Optional custom EventTarget
  serializer?: TSerializer,
})
```

## TypeScript Support

tschannel is built with TypeScript and provides full type safety:

```typescript
// Types are automatically inferred
const namespace = new NamespaceBuilder('app')
  .mainToWorkerMessage<{ id: number }, { name: string }>()('getUser')
  .build();

const bridge = new Bridge(namespace, channel);

// ✅ Type-safe: payload is { id: number }, response is { name: string }
const user = await bridge.dispatch(send.getUser({ id: 123 }));
console.log(user.name); // string

// ❌ TypeScript error: wrong payload type
await bridge.dispatch(send.getUser({ id: 'wrong' }));

// ✅ Type-safe handler
bridge.listen(messages.getUser, async (payload) => {
  // payload is { id: number }
  return { name: 'John' }; // Must return { name: string }
});

// ❌ TypeScript error: wrong return type
bridge.listen(messages.getUser, async (payload) => {
  return { id: 123 }; // Type error!
});
```

## Testing

tschannel includes comprehensive tests using Vitest:

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter @tschannel/core test
pnpm --filter @tschannel/iframe-channel test

# Watch mode
pnpm test:watch
```

## Development

### Monorepo Structure

```
tschannel/
├── packages/
│   ├── core/                   # Core library
│   ├── iframe-channel/         # Iframe channel implementation
│   └── pubsub-channel/         # PubSub channel implementation
├── apps/
│   └── dev-app/                # Demo application (SolidJS)
├── configs/                    # Shared configurations
└── .changeset/                 # Changesets for versioning
```

### Build and Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Build specific package
pnpm --filter @tschannel/core build

# Run demo app
pnpm --filter dev-app dev

# Run linter
pnpm lint

# Type check
pnpm typecheck

# Format code
pnpm format
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linters: `pnpm test && pnpm lint && pnpm typecheck`
5. Create a changeset: `pnpm changeset`
6. Submit a pull request

For detailed contribution guidelines, see [CONTRIBUTING.md](.claude/README.md).

## Requirements

- **Node.js**: >= 18
- **TypeScript**: >= 5.0
- **Module format**: ESM only
- **Target**: ES5 (transpiled output)

## Browser Compatibility

tschannel works in all modern browsers that support:
- ES6 Promises
- EventTarget API
- postMessage API (for iframe communication)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

Developed by [Vladimir Sannikov](https://github.com/SoEasy)

## Links

- [GitHub Repository](https://github.com/SoEasy/tschannel)
- [Issue Tracker](https://github.com/SoEasy/tschannel/issues)
- [Architecture Documentation](.claude/PROJECT.md)
- [Code Style Guide](.claude/CODESTYLE.md)

---

**Built with ❤️ using TypeScript**
