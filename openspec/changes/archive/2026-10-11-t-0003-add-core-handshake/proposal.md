## Why

`Bridge.isReady()` currently reports only that the local channel has initialized; it does not prove that a remote bridge exists or can exchange compatible protocol messages. Consumers therefore rely on timing assumptions such as arbitrary iframe delays, and requests can be dispatched before the peer is available.

## What Changes

- Add a transport-agnostic core handshake that lets main and worker bridges announce themselves, negotiate a compatible protocol session, and become ready only after both peers confirm that session.
- Use a symmetric `HELLO` announcement so either startup order works without assigning permanent initiation responsibility to main or worker; do not introduce a separate `HELLO_RESPONSE` frame.
- Let main select one compatible worker endpoint and establish a session identifier so application frames from unrelated endpoints are ignored on shared transports.
- Add bounded, idempotent handshake retry and timeout behavior for lost control frames without using aggressive polling to discover a late-loading peer.
- Add an awaitable bridge readiness API and make dispatch wait for handshake readiness before sending an application request.
- Separate local channel readiness from remote bridge readiness and expose protocol initialization failures through the bridge lifecycle.
- Make startup robust when a transport delivers an inbound control frame while local channel initialization is still pending; symmetric post-initialization `HELLO` announcements must recover without premature protocol sends or permanent readiness failure.
- Validate untrusted control and application envelopes before routing them so unknown discriminants and missing required fields cannot reject readiness, establish an invalid session, invoke handlers, or settle pending requests.
- Treat an incompatible unaddressed `HELLO` as an ignorable shared-transport announcement so a later compatible worker can still be selected; keep incompatible addressed negotiation terminal.
- Prevent an application dispatch from sending after `destroy()` when asynchronous middleware began before destruction but completes afterward.
- Repeat channel cleanup if asynchronous channel initialization settles after bridge destruction so a late initializer cannot reactivate local transport resources.
- **BREAKING**: Change `Bridge.isReady()` from local-channel readiness to completed protocol-session readiness, and extend the internal wire-message contract with handshake control frames and session addressing.
- Record the durable protocol ownership and symmetric handshake decision in a proposed ADR.
- Keep automatic reconnect, heartbeat/liveness monitoring, application-handler discovery, payload-schema negotiation, peer authentication, and multi-peer routing out of scope.

## Capabilities

### New Capabilities

- `core/handshake`: Defines bridge discovery, endpoint selection, session establishment, readiness, retry, timeout, and application-frame isolation behavior in `@tschannel/core`.

### Modified Capabilities

None.

## Impact

- `@tschannel/core`: Bridge lifecycle, public readiness/configuration APIs, exported protocol types, serializer input, application dispatch, and protocol tests.
- `@tschannel/iframe-channel` and `@tschannel/pubsub-channel`: compatibility verification for handshake control frames and revised listener/initialization ordering; no transport-specific handshake state machine.
- Custom channel and serializer implementers: must transport and preserve the expanded internal protocol envelope. Migration guidance and README/API examples require updates.
- Published packages gain no runtime dependency. The root test toolchain gains `jsdom` for the iframe package's existing browser test environment. The core behavior requires a Changeset and an explicit release-impact decision because the readiness and wire contracts change.
- `.ai/adr/0001-core-handshake-protocol.md` and `.ai/adr/INDEX.md`: proposed architecture decision and inventory entry.
- Repository dependency metadata: retain only dependency-resolution changes produced by pnpm and remove unrelated whole-file formatting churn from `pnpm-lock.yaml`.
