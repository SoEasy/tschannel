## 1. Protocol Types and Public Contract

- [x] 1.1 Define versioned control and session-addressed application envelope types, protocol constants, rejection reasons, endpoint/session identifiers, and named exports in `@tschannel/core`; verify the public declarations contain no `HELLO_RESPONSE` variant.
- [x] 1.2 Extend bridge configuration with separately defaulted handshake timeout and selection-retry settings while preserving the existing application request timeout and retry fields.
- [x] 1.3 Update the `IChannel` and serializer type contracts so receivers can be registered before initialization and both control and application envelope families are transported without channel-specific negotiation.

## 2. Bridge Lifecycle and Handshake

- [x] 2.1 Refactor bridge startup to create one retained readiness result, register the channel receiver before initialization, propagate channel initialization failures, and expose protocol-based `isReady()` and `ready()` behavior.
- [x] 2.2 Implement idempotent `HELLO` announcement and reactive re-announcement for main-first, worker-first, and concurrent startup without a periodic discovery loop or a `HELLO_RESPONSE` frame.
- [x] 2.3 Implement main-side compatibility checks, first-compatible-worker selection, session creation, addressed `SELECT` transmission, bounded selection retry, matching `CONNECTED` handling, rejection handling, and handshake timeout.
- [x] 2.4 Implement worker-side compatibility checks, addressed selection acceptance, duplicate-selection `CONNECTED` replay, busy/invalid rejection behavior, and single-session enforcement.
- [x] 2.5 Ensure destruction clears handshake timers, rejects unresolved readiness, leaves later frames inert, and preserves existing cleanup of pending application requests and handlers.

## 3. Session-Isolated Application Messaging

- [x] 3.1 Add the active session and selected endpoint addressing to request, response, and error envelopes, and filter inbound application traffic by namespace, role, source endpoint, target endpoint, and session before routing it.
- [x] 3.2 Change pre-ready dispatch to await bridge readiness, start the application timeout only after sending the request, and propagate handshake failure without emitting an application frame.
- [x] 3.3 Keep handshake control frames outside application handlers, middleware hooks, and pending-request resolution while still passing them through configured channel serializers.

## 4. Focused Verification

- [x] 4.1 Expand the core test transport to model asynchronous initialization, late peers, broadcast delivery, dropped selection/confirmation frames, multiple endpoints, and initialization failure.
- [x] 4.2 Add core handshake tests for every `core/handshake` scenario: both startup orders, concurrent startup, exact protocol compatibility, unrelated namespaces, multiple workers, duplicate control frames, timeout, rejection, destruction, and no automatic peer replacement.
- [x] 4.3 Add readiness and dispatch tests covering repeated `ready()` calls, local-ready/peer-absent state, dispatch queued before handshake, independent request timeout, foreign-session filtering, and control-frame isolation from middleware.
- [x] 4.4 Run the focused core checks (`pnpm --filter @tschannel/core typecheck`, `pnpm --filter @tschannel/core test`, and `pnpm --filter @tschannel/core build`) and resolve all failures without committing generated `dist/` or `build/` output.

## 5. Bundled Channels and Migration Documentation

- [x] 5.1 Add or update PubSub channel tests to verify symmetric handshake, one selected worker on a shared event bus, control-envelope serialization, and session isolation.
- [x] 5.2 Add or update iframe channel tests to verify receiver-before-initialize behavior and end-to-end handshake control-envelope transport while preserving origin validation.
- [x] 5.3 Update package and root documentation for `Bridge.ready()`, new `Bridge.isReady()` semantics, handshake configuration, custom channel initialization ordering, serializer migration, protocol compatibility, and the explicit no-heartbeat/no-reconnect guarantee.
- [x] 5.4 Update bundled channel peer dependency ranges for the new core protocol release and verify no unrelated package or dependency changes are introduced.

## 6. Review Follow-up

- [x] 6.1 Gate inbound protocol processing until local channel initialization succeeds, and add a regression transport/test that delivers peer `HELLO` while initialization is pending and proves handshake convergence afterward.
- [x] 6.2 Revalidate bridge destruction and active-session identity after asynchronous send middleware settles, and add a regression test proving `destroy()` rejects the dispatch without sending an application frame.
- [x] 6.3 Update ADR 0001 with the pre-initialization frame gate and post-middleware lifecycle check, preserving the symmetric `HELLO` design and the absence of `HELLO_RESPONSE`.
- [x] 6.4 Remove whole-file formatting churn from `pnpm-lock.yaml`, regenerate only the dependency-resolution changes required by this change with pnpm, and verify the resulting diff is focused.
- [x] 6.5 Re-run the focused core typecheck, tests, and build after the race-condition fixes.

## 7. Release and Repository Verification

- [x] 7.1 Add Changesets with the planned release decision: minor for `@tschannel/core` because the pre-1.0 readiness and wire contracts change, and patch releases for bundled channel packages whose compatibility metadata or implementation changes.
- [x] 7.2 Run `openspec validate t-0003-add-core-handshake --strict` and confirm the proposal, `core/handshake` delta, design, tasks, and ADR links remain consistent with the implemented behavior.
- [x] 7.3 Run repository-wide `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, and `pnpm build`; inspect `git status` to ensure generated artifacts and unrelated existing edits are not included, and record any unrelated pre-existing formatting failures without modifying those files.

Verification note: lint, typecheck, format, tests, and build pass. Lint and API Extractor retain existing non-blocking warnings outside the second review follow-up.

## 8. Second Review Follow-up

- [x] 8.1 Validate incoming control-envelope discriminants and required runtime fields before changing handshake state; ignore unknown or malformed frames and add regressions for an unknown control type and a `SELECT` without `sessionId`.
- [x] 8.2 Ignore an unaddressed incompatible `HELLO` without settling readiness, preserve addressed version-mismatch failure, and add a shared-bus regression proving main can later select a compatible worker.
- [x] 8.3 Align the root custom-channel documentation and ADR with the pre-initialization frame gate, malformed-frame handling, and mixed-version shared-transport behavior.
- [x] 8.4 Run focused core checks, strict OpenSpec validation, and repository-wide lint, typecheck, format, tests, and build; inspect the final diff and status for generated or unrelated artifacts.

## 9. Third Review Follow-up

- [x] 9.1 Introduce explicit `isControlMessage` and `isApplicationMessage` runtime guards, route only validated protocol envelopes, and add a regression proving malformed input cannot settle an active request.
- [x] 9.2 Repeat channel cleanup when asynchronous initialization settles after bridge destruction, and add a regression proving the channel remains not ready and emits no late `HELLO`.
- [x] 9.3 Update the proposal, handshake specification, design, and ADR with the protocol-envelope validation and initialization/destruction lifecycle guarantees.
- [x] 9.4 Run focused core checks, strict OpenSpec validation, and repository-wide lint, typecheck, format, tests, and build; inspect the final diff and status for generated or unrelated artifacts.

Third follow-up verification note: core has 107 passing tests; focused and repository-wide lint, typecheck, format, tests, and build pass; strict OpenSpec validation passes. Existing non-blocking lint and API Extractor warnings remain unchanged.
