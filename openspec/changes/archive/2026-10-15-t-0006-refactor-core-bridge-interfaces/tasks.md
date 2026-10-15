## 1. Contract Baseline

- [x] 1.1 Reconcile the then-current `@tschannel/core` source and tests with this change; record any intervening behavior or API changes in the OpenSpec artifacts before moving code.
- [x] 1.2 Verify consumer-style type tests for namespace-specific `Bridge.dispatch`/`Bridge.listen` inference, invalid-message rejection, and unchanged imports and signatures; add focused coverage only for gaps.
- [x] 1.3 Define private `IMessageShapeGuard`, `IProtocolSession`, `IMessaging`, `IMiddlewarePipeline`, and `TWellFormedShape` contracts; add `packages/core/test/bridge/contracts.test.ts` with compile-time checks of their signatures and narrowing.

## 2. Internal Ownership

- [x] 2.1 Move structural control/application checks behind `IMessageShapeGuard.isCorrectShape()`; add `packages/core/test/bridge/shape-guard.test.ts` for valid, malformed, unknown, and incompatible-version shapes, and verify foreign-session outcomes through integration tests.
- [x] 2.2 Extract middleware transformations, error hooks, and observation behind `IMiddlewarePipeline`; add `packages/core/test/bridge/middleware.test.ts` for stage order, phase values, observer isolation, and failures.
- [x] 2.3 Extract handshake, selected peer/session, readiness, and protocol timers behind `IProtocolSession`; add `packages/core/test/bridge/session.test.ts` for startup order, lost confirmation retry, timeout, and late initialization after destruction.
- [x] 2.4 Extract typed dispatch/listen, handlers, pending requests, response/error settlement, and request timeouts behind `IMessaging`; add `packages/core/test/bridge/messaging.test.ts` for synchronous responses, concurrent requests, missing handlers, remote errors, timeouts, and destruction during asynchronous middleware.

## 3. Facade and Public Package Surface

- [x] 3.1 Reduce `Bridge` to channel ownership, ingress routing, public delegation, and coordinated destruction; add `packages/core/test/bridge/bridge.test.ts` for these integration boundaries.
- [x] 3.2 Add a short English responsibility comment before imports in every source file under `packages/core/src/bridge/`; verify each comment describes that file's boundary.
- [x] 3.3 Move source into `packages/core/src/bridge/` with a directory `index.ts`; add `packages/core/test/bridge/index.test.ts` for entry-point exports, and compare generated declarations, `Bridge.ERRORS`, and existing consumer imports for compatibility.

## 4. Verification and Release

- [x] 4.1 Confirm every new `packages/core/src/bridge/*.ts` file has its corresponding `packages/core/test/bridge/*.test.ts` file with meaningful contract coverage; run those tests and the existing core bridge, handshake, middleware, observation, and type-safety suites.
- [x] 4.2 Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, and `pnpm build`; inspect generated API declarations and ensure generated `dist/` and `build/` files are not committed.
- [x] 4.3 Record the Changesets decision: account for the requested inferred readonly literal `Bridge.ERRORS` type in the change scope and release impact.
- [x] 4.4 Validate the OpenSpec change with `openspec validate t-0006-refactor-core-bridge-interfaces --strict` and confirm all tasks are complete before archiving.

## 5. Error catalog typing follow-up

- [x] 5.1 Remove both inline `ERRORS` type declarations, infer the catalog with `as const`, and verify unchanged runtime keys, values, and function signatures.
- [x] 5.2 Add consumer-facing type tests for inferred readonly literal strings; compare generated declarations and rerun relevant verification and strict OpenSpec validation.

## 6. Contract and implementation documentation

- [x] 6.1 Document every field in the new bridge contract types and interfaces, including configuration, observations, session snapshots, traces, and collaborator methods.
- [x] 6.2 Document state fields, constructor dependencies, and methods in every implementation under `packages/core/src/bridge/`; keep each file's opening responsibility comment.
- [x] 6.3 Verify comment coverage, formatting, declarations, tests, build, and strict OpenSpec validation.
