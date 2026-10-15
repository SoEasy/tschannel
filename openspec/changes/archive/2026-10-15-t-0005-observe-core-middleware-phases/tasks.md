## 1. Public Middleware Contract

- [x] 1.1 Add `observe(message, phase)` and exported phase/message-view types to `@tschannel/core`; keep all existing transformation hook signatures and automatic continuation behavior compatible.
- [x] 1.2 Add JSDoc to every `TBridgeMiddleware` method describing its invocation point, transformation or observation authority, async behavior, and representative use.

## 2. Application Lifecycle Observation

- [x] 2.1 Assign a stable exchange ID before `dispatchStarted` and report the sending-side request and response phases, including unchanged stage results when hooks are absent.
- [x] 2.2 Report receiving-side request and response phases after active-session validation, including handler and transformation results, response submission, and omission of phases that never occurred.
- [x] 2.3 Report `failed` with exchange ID, failing stage, and error for transformation, handler, missing-handler, remote-error, timeout, readiness, and destruction paths without changing existing result semantics.
- [x] 2.4 Add focused core tests for full phase order and values, no-hook stages, multiple hooks per stage, concurrent IDs, reentrant channel delivery, ignored frames, and failure paths.

## 3. Handshake Observation And Isolation

- [x] 3.1 Report admitted `controlReceived`, submitted `controlSent`, and readiness `failed` events while keeping control frames out of application transformation hooks and handlers.
- [x] 3.2 Deliver observer callbacks without awaiting them; contain sync throws and async rejections per observer, preserve per-bridge capture order, and give observers detached control-frame views.
- [x] 3.3 Extend core handshake tests for valid and ignored frames, early registration timing, non-settling observers, thrown/rejected observers, control-view mutation, and unchanged handshake outcomes.

## 4. Documentation And Release

- [x] 4.1 Expand the root README middleware section with hook purposes, the successful main/worker phase sequence, control phases, `failed`, registration timing, `Sent`/`Received` meanings, and a `getAge` transformation trace.
- [x] 4.2 Add a Changeset for an additive minor `@tschannel/core` release, or document a different release decision if implementation changes compatibility.

## 5. Verification

- [x] 5.1 Run focused `@tschannel/core` tests, typecheck, lint, and build; verify the public declaration export includes the observer contract.
- [x] 5.2 Run `openspec validate t-0005-observe-core-middleware-phases --strict` and repository-wide `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, and `pnpm build`; inspect the diff for generated artifacts and unrelated changes.
