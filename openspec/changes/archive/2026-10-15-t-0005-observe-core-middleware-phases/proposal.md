## Why

Bridge middleware currently exposes only application payload transformations and error callbacks. Users cannot trace a request across its local and remote stages or observe handshake traffic without reaching into channel internals, and the existing hooks do not explain their timing or intended use.

## What Changes

- Add an `observe` hook to `TBridgeMiddleware` that reports named, ordered lifecycle phases for application requests, responses, failures, and valid handshake control frames.
- Report application lifecycle phases whether or not a transformation hook is registered; preserve the existing transformation hooks and their automatic continuation behavior. No `next` callback or intentional message cancellation is introduced.
- Keep handshake control frames outside application transformation hooks while allowing `observe` to see their send and receive events without controlling negotiation.
- Document every middleware method in its public type and add a dedicated README section with the phase contract and a main-to-worker-to-main trace.

## Capabilities

### New Capabilities

- `core/middleware`: Defines transformation and observation hooks, phase order, failure reporting, and their isolation boundaries.

### Modified Capabilities

- `core/handshake`: Clarifies that control frames remain isolated from application transformations while the new observer can report their protocol send and receive phases.

## Impact

- `@tschannel/core`: Additive public middleware hook and exported phase/event types, Bridge instrumentation, focused tests, and public API extraction.
- Root `README.md`: Expanded middleware documentation and examples.
- Existing consumers can keep their current transformation hooks; no package manifest or new dependency is expected. Observation adds callbacks only when `observe` is registered.
- A user-visible core feature requires a Changesets decision, expected to be a minor release for `@tschannel/core` if the public API remains additive.
- Iframe source isolation in active change `t-0004` remains separate; transport filtering, peer selection, retry, reconnection, and payload schema changes are out of scope.
