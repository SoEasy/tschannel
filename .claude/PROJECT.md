# tschannel

TypeScript library for type-safe bidirectional communication between different execution contexts.

## Project Goal

**tschannel** provides a robust, type-safe messaging system for communication between isolated JavaScript environments such as:
- **Iframes** and parent windows (via postMessage)
- **Web Workers** and main threads
- **Service Workers** and clients
- **Chrome Extensions** (background/content scripts)
- **Electron** (main/renderer processes)

### Key Features

- **Type Safety**: Full TypeScript support with typed request/response messages
- **Bidirectional**: Both sides can send and receive messages
- **Namespace-based**: Organize messages into logical namespaces
- **Channel Agnostic**: Core logic separated from transport layer
- **Middleware Support**: Intercept and transform messages
- **Promise-based**: Async/await friendly API

### Use Cases

- Building complex iframe-based applications
- Worker-based parallel processing with type-safe communication
- Chrome extension message passing
- Multi-window applications

## Architecture: Monorepo

The project is organized as a monorepo with independent packages:

### Packages

- **@tschannel/core** — core system (Bridge, NamespaceBuilder, types, interfaces)
- **@tschannel/pubsub-channel** — channel for intra-thread communication via EventTarget
- **@tschannel/iframe-channel** — channel for iframe communication via postMessage

### Applications

- **dev-app** — SolidJS application for testing and demonstrating all channels

### Monorepo Management

- **Package manager**: pnpm with workspaces
- **Build orchestration**: Turborepo (caching, parallel builds)
- **Versioning**: Changesets (independent package versioning)

## Build Artifact Requirements (for each package)

- Output: one `dist/index.js` (ESM, ES5 target) and one `dist/index.d.ts`
- Sourcemap: enabled (`dist/index.js.map`) and included in publication
- No external dependencies: all code and helpers inlined (no tslib)
- Non-minified JS (transpilation to ES5 only)

## Tools and Stack

### Common for monorepo

- **Bundler**: Rollup (shared config in `configs/rollup.config.shared.js`)
- **TypeScript**: shared base configuration in `configs/tsconfig.base.json`
- **Type generation**: API Extractor (single `index.d.ts` for each package)
- **Tests**: Vitest
  - **core**: Node environment (no DOM)
  - **pubsub-channel**: Node environment
  - **iframe-channel**: jsdom (for window, postMessage API)
- **Linting/formatting**: ESLint (+ @typescript-eslint) and Prettier
- **Git hooks**: husky + lint-staged; commitlint with Conventional Commits
- **Versioning**: Changesets (replaces semantic-release)
- **CI**: GitHub Actions — checks, build, tests, API Extractor

### Package Dependencies

- Channels depend on **core** via **peer dependencies**
- Uses protocol `workspace:*` for internal dependencies
- Each package is built independently

## Target Compatibility

- **Environments**: browser, service worker, Chrome extensions, Electron, Node.js
- **Module format**: ESM only
- **Runtime target**: ES5 (no `async/await` in output JS)
- **Minimum platforms**: Node >= 18; modern browsers

## Monorepo Structure

```
tschannel/
├── packages/
│   ├── core/                     # Library core
│   │   ├── src/
│   │   │   ├── index.ts         # Public API export
│   │   │   ├── bridge.ts        # Bridge class
│   │   │   ├── builder.ts       # NamespaceBuilder
│   │   │   ├── channel.ts       # IChannel interface
│   │   │   ├── types.ts         # Types and serialization
│   │   │   └── utils.ts         # Utilities
│   │   ├── dist/                # Build artifacts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsconfig.build.json
│   │   ├── rollup.config.js
│   │   ├── api-extractor.json
│   │   └── vitest.config.ts
│   │
│   ├── pubsub-channel/          # PubSub channel
│   │   ├── src/index.ts
│   │   ├── dist/
│   │   └── [configs...]
│   │
│   └── iframe-channel/          # Iframe channel
│       ├── src/index.ts
│       ├── dist/
│       └── [configs...]
│
├── apps/
│   └── dev-app/                 # Demo application (SolidJS + Vite)
│       ├── src/
│       │   ├── pages/           # PubSubDemo, IframeDemo
│       │   ├── channels/        # Setup for channels
│       │   ├── components/      # DemoControls
│       │   └── App.tsx          # Router and UI
│       ├── index.html
│       ├── iframe.html          # For iframe demo
│       └── package.json
│
├── configs/                     # Shared configurations
│   ├── tsconfig.base.json
│   └── rollup.config.shared.js
│
├── .changeset/                  # Changesets configuration
├── turbo.json                   # Turborepo configuration
├── pnpm-workspace.yaml          # pnpm workspace definition
└── package.json                 # Root (private: true)
```

## Published Package APIs

### @tschannel/core

Core functionality for building type-safe communication bridges.

**Main Classes:**
- **Bridge** — Main class for creating and managing message bridges
- **NamespaceBuilder** — Builder for creating namespaces with typed message definitions
- **NamespaceMessages** — Typed namespace container with message metadata

**Interfaces:**
- **IChannel** — Interface for implementing custom transport channels
- **TChannelConfig** — Base configuration type for channels

**Types:**
- **TInternalMessage** — Internal message format
- **TSerializer** — Serializer interface for custom serialization
- **TBridgeConfig** — Bridge configuration (timeout, retries)
- **TBridgeMiddleware** — Middleware hooks for message lifecycle

**Utilities:**
- **DEFAULT_SERIALIZER** — Default JSON serializer
- **generateMessageId** — Unique message ID generator

### @tschannel/pubsub-channel

- **PubSubChannel** — channel with automatic shared EventTarget
- **TPubSubChannelConfig** — configuration (extends TChannelConfig)
- Usage: simple creation without explicit EventTarget

### @tschannel/iframe-channel

- **IframeChannel** — channel with automatic targetWindow detection
- **TIframeChannelConfig** — configuration (extends TChannelConfig)
- Automation:
  - `side: 'main'` → requires `iframe` element → uses `iframe.contentWindow`
  - `side: 'worker'` → automatically uses `window.parent`

## API Style

- Exports: named only (`export { ... }`)
- Each package exports its public API through `src/index.ts`

## CI/CD Policy

- **CI checks**: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`
- **Turborepo**: caching build and test results
- **Changesets**: version and package publication management
- **Release**: via Changesets workflow (create PR with versions → merge → publish)

## Development Versions

- Node 18 LTS
- pnpm 9.x
- TypeScript 5.x
- Turborepo 2.x
- Changesets CLI

## Channel Design Principles

All channels follow a unified principle:

1. **One channel per bridge** — no need to create channel pairs
2. **Automatic target detection** — channel understands how to work based on `side`
3. **Minimal boilerplate** — user specifies only what's necessary
4. **Logic encapsulation** — all complexity is hidden inside the channel

Examples:

```typescript
// PubSubChannel - automatic shared EventTarget
const channelA = new PubSubChannel({ side: 'main' });
const channelB = new PubSubChannel({ side: 'worker' });

// IframeChannel - automatic window detection
const parentChannel = new IframeChannel({ side: 'main', iframe: el });
const childChannel = new IframeChannel({ side: 'worker' });
```

## Development Commands

### Build Commands

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @tschannel/core build
pnpm --filter @tschannel/iframe-channel build
pnpm --filter @tschannel/pubsub-channel build
```

### Test Commands

```bash
# Run all tests
pnpm test

# Test specific package
pnpm --filter @tschannel/core test
pnpm --filter @tschannel/iframe-channel test
pnpm --filter @tschannel/pubsub-channel test

# Watch mode
pnpm test:watch
```

### Development

```bash
# Run dev-app (demo application)
pnpm --filter dev-app dev

# Clean all build artifacts
pnpm clean
```

### Quality Checks

```bash
# Lint
pnpm lint
pnpm lint:fix

# Type check
pnpm typecheck

# Format check
pnpm format:check
pnpm format
```

### Versioning

```bash
# Create changeset
pnpm changeset

# Version packages (for maintainers)
pnpm version-packages

# Publish packages (for maintainers)
pnpm release
```

## Notes

- DOM is used only in **iframe-channel** (for postMessage API)
- **core** and **pubsub-channel** work in any environment
- Polyfills are not included; consumer's responsibility
- Each package is published independently with its own version
