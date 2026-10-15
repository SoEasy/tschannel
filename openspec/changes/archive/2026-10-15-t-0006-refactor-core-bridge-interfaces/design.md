## Context

See `proposal.md` for motivation. The current `packages/core/src/bridge.ts` owns the public API, runtime message guards, channel initialization, handshake readiness, session identity, request correlation, listener registration, middleware transformations, and phase observation. `core/handshake` and `core/middleware` already specify the observable protocol and pipeline behavior, so this design moves ownership without changing those contracts.

## Goals / Non-Goals

**Goals:**

- Make internal interfaces the explicit boundaries between replaceable collaborators while preserving the concrete `Bridge` class as the public contract.
- Give each mutable state group one owner and make the facade's coordination order visible.
- Preserve the current core package entry point, type inference, protocol wire format, and runtime outcomes.

**Non-Goals:**

- Expose internal collaborators as supported package APIs.
- Add a capability or OpenSpec spec for every source file.
- Change the meaning of the existing `retries` configuration, implement application retries, reconnect peers, or alter channel implementations.

## Decisions

### 1. Keep `Bridge` as the sole public bridge contract

Do not add `IBridge`. Consumers already have the typed `Bridge` class, whose constructor and generic `dispatch` and `listen` methods remain unchanged. The public class and existing package exports are the stable contract; tests cover their behavior and type inference. `Bridge.ERRORS` retains its keys and runtime values, while its type is inferred from an `as const` catalog so constant strings are readonly literals. Internal interfaces describe replaceable components without becoming supported exports.

Alternative considered: export `IBridge` or every internal domain interface. Rejected because neither adds a consumer capability needed for this refactor, while each creates another public compatibility commitment.

### 2. Organize internal contracts and implementations in `src/bridge/`

Use this initial layout, refining filenames only if required by TypeScript or build tooling:

```text
packages/core/src/bridge/
  index.ts          public re-exports for the existing ./bridge import
  bridge.ts         Bridge facade and lifecycle coordination
  contracts.ts      internal port/type contracts
  shape-guard.ts    IMessageShapeGuard implementation
  session.ts        IProtocolSession implementation
  messaging.ts      IMessaging implementation
  middleware.ts     IMiddlewarePipeline implementation
```

Every source file in this directory, including `index.ts` and `contracts.ts`, starts with a short English section comment before imports. It states the file's responsibility and relevant boundary with adjacent modules. `packages/core/src/index.ts` continues to export from `./bridge`, which resolves through the new directory index; consumers continue to import from `@tschannel/core`.

Document each field in the new contract types and interfaces, and each state field and method in their implementations and the `Bridge` facade. Comments should explain ownership, lifecycle, and caller expectations, especially where names alone do not convey them. Keep these comments in English, consistent with the file headers.

Alternative considered: split the current class into multiple files while retaining access to one shared state object. Rejected because it moves lines without creating independent ownership or testable contracts.

### 3. Separate structural shape from session admission

`IMessageShapeGuard` has the type-predicate method `isCorrectShape(value: unknown): value is TWellFormedShape`. `TWellFormedShape` names a checked incoming frame, not a schema descriptor. It is a discriminated control/application union with the required fields and basic field types for each known frame type. Incoming control `protocolVersion` remains a number at this boundary so a well-shaped incompatible version reaches protocol handling. Application payload values remain `unknown`.

The guard does not deserialize the channel value, evaluate version compatibility, choose a peer, check namespace or session ownership, or decide whether a frame should affect readiness. The channel retains serialization/deserialization; `IProtocolSession` applies protocol and admission rules. Unknown or malformed frames stop at the guard and cannot reach either session or messaging. Existing ignored-frame and observer behavior remains as specified by `core/handshake` and `core/middleware`.

Alternative considered: have one parser return `TInternalMessage | null` with a narrowed current protocol version. Rejected because that could incorrectly discard structurally valid incompatible frames before the session applies its rejection rules.

### 4. Give protocol and application state separate owners

`IProtocolSession` owns local/peer endpoint identities, one selected session, readiness settlement, handshake timeout, and addressed `SELECT` retry. Its contract includes starting after local channel initialization, accepting well-shaped control frames, admitting application frames for the active session, exposing the current immutable session snapshot and readiness result, failing initialization, and becoming inert on destruction. It sends control frames through a narrow send callback supplied by the facade, not through a reference to the whole `Bridge`.

`IMessaging<Namespace>` owns typed dispatch/listen, handler registration, pending request IDs and timers, response/error settlement, and application frame construction. It receives only admitted application frames. It waits for the session's readiness result before a send, captures the selected session, and rechecks session validity and destruction after asynchronous middleware before channel submission. It registers a pending request before sending to support synchronous, reentrant channels.

`IMiddlewarePipeline` owns registration order, the four existing application transformation stages, error hooks, and asynchronous non-controlling observation. Both session and messaging report lifecycle events through this narrow port. Keeping transformation and observation behind one internal port matches the existing public `TBridgeMiddleware` registration API; their distinct rules remain explicit within that port.

Alternative considered: have session, messaging, and middleware call back into `Bridge` methods or access its fields. Rejected because this would recreate the original coupling across several files.

### 5. `Bridge` coordinates ingress and destruction

The facade remains the sole owner of `IChannel`. It registers `onMessage` before calling `initialize`; after successful local initialization it starts the session. At ingress it applies the shape guard, routes control frames to session, and routes application frames to messaging only after session admission. The facade delegates public calls to the appropriate collaborator and coordinates `destroy()` across active dispatches, request timers, handshake timers, middleware registrations, and channel cleanup. If channel initialization completes after destruction, it cleans the channel again and sends no `HELLO`.

```text
channel delivery -> IMessageShapeGuard -> IProtocolSession (control)
                                  \-> IProtocolSession admission -> IMessaging (application)
Bridge.dispatch -> IMessaging -> readiness/session -> middleware -> channel send
```

The existing public methods remain the observable integration surface. Collaborator tests target their interfaces and boundary behavior, while end-to-end tests confirm the assembled Bridge preserves the current contracts.

Alternative considered: let each collaborator subscribe to `IChannel`. Rejected because it would obscure registration order and allow control or foreign-session frames to leak into application handling.

### 6. Test every new source file through its own contract

Each new `packages/core/src/bridge/<name>.ts` file has a corresponding `packages/core/test/bridge/<name>.test.ts` file. Tests exercise the file's responsibility through its public or internal interface rather than merely checking that a symbol exists:

| Source | Focused test contract |
| --- | --- |
| `index.ts` | Directory and package entry points expose the same existing Bridge symbols and types. |
| `contracts.ts` | Compile-time checks enforce the internal port signatures and discriminated `TWellFormedShape` narrowing. |
| `shape-guard.ts` | Known frame shapes narrow correctly; malformed and unknown frames do not. |
| `session.ts` | Readiness, peer selection, admission, timeout, retry, and destruction follow the protocol contract. |
| `messaging.ts` | Dispatch/listen, request correlation, synchronous responses, timeout, and cancellation follow the application contract. |
| `middleware.ts` | Transformation order, errors, observation phases, and observer isolation follow the middleware contract. |
| `bridge.ts` | The assembled facade preserves ingress routing, public calls, startup order, and coordinated destruction. |

Existing `packages/core/test/` suites remain useful end-to-end regression coverage. They may be moved or reused where appropriate, but each new source file must have its own named test file and meaningful assertions. Test files are not recursively subject to the source-file pairing rule.

## Risks / Trade-offs

- [Type-level compatibility can regress while runtime tests pass] -> Compile existing consumer-style `Bridge` inference tests; compare generated declarations and run API Extractor through the build.
- [Moving readiness and messaging into separate objects can introduce races] -> Preserve and exercise early frame handling, synchronous response delivery, asynchronous middleware followed by destruction, lost `CONNECTED`, and late channel initialization cases.
- [Observation can shift across ownership boundaries] -> Keep current phase ordering, admitted-frame criteria, terminal failure rules, and observer isolation tests from `core/middleware`.
- [The extra interfaces can become pass-through wrappers] -> Keep ports narrow, with one owner per mutable state group; do not add a collaborator solely to make each file have a class.
- [Per-file tests can duplicate integration coverage] -> Test each module's distinct contract in its paired file and retain cross-module scenarios in the existing integration suites.
- [Concurrent source edits could be overwritten] -> Apply the refactor to the then-current working tree and reconcile any active changes before moving code; preserve unrelated changes.

## Migration Plan

Move code in verified stages: introduce internal contracts and shape guard; extract middleware; extract session; extract messaging; reduce `Bridge` to coordination and switch the package-local `./bridge` entry point to the directory. Preserve all public exports throughout. Run focused contract tests after each state-owner extraction and full repository checks before completion. If a stage regresses behavior, revert that stage while retaining earlier verified extractions; no wire or data migration is needed.

## Verification and release decision

The initial refactor passed core and repository test, typecheck, lint, format, and build commands. A subsequent review requested inferred `Bridge.ERRORS` typing. The generated declaration retains the same error keys and function parameters while showing readonly literal string properties. This is a source-level compatibility change for consumers that reassign error properties, so it is recorded as a minor Changeset for the pre-1.0 core package. `as const` is a TypeScript constraint; it does not freeze the runtime object. `pnpm changeset status` also projects dependent channel releases because their peer ranges currently end at `^0.2.0`; versioning and peer-range updates remain a separate release step.
