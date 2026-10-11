## Context

See [proposal.md](proposal.md) for motivation and [specs/core/handshake/spec.md](specs/core/handshake/spec.md) for the observable contract.

`Bridge` currently starts channel initialization from its constructor without retaining an awaitable initialization result. `Bridge.isReady()` delegates to `channel.isReady()`, and the channel installs only local transport listeners. `TInternalMessage` contains request, response, and error variants but has no protocol-control family or session addressing. Both bundled channels can carry arbitrary serializable objects, while custom channels and serializers compile against the exported `TInternalMessage` type.

The transports targeted by tschannel have different startup orders. A parent often exists before an iframe or worker script, while an extension or DevTools context can invert that order. The design therefore cannot rely on one permanently designated handshake initiator or on aggressive polling from main.

## Goals / Non-Goals

**Goals:**

- Keep protocol negotiation in `@tschannel/core` and keep channels responsible for local transport readiness and envelope delivery.
- Complete handshake regardless of whether main or worker initializes first.
- Use one `HELLO` frame type for initial announcement and reactive re-announcement; never create `HELLO_RESPONSE`.
- Select one worker and isolate application traffic with endpoint and session identifiers, including on a broadcast transport.
- Provide one awaitable bridge-readiness result and make pre-ready dispatch safe.
- Make control processing idempotent and bound incomplete negotiation with a timeout.

**Non-Goals:**

- Heartbeats, disconnect detection, peer replacement, and automatic reconnect.
- Multiple active peers within one `Bridge`; multi-client transports must expose one logical channel/bridge pair per peer.
- Authentication or authorization of endpoints; transport security such as iframe origin validation remains a channel concern.
- Runtime verification of TypeScript payload shapes, handler availability, or complete namespace schemas.
- Delivery guarantees beyond those of the selected channel after a session has been established.

## Decisions

### Keep the handshake state machine in core

`Bridge` will own endpoint discovery, compatibility validation, worker selection, session creation, readiness, and filtering. `IChannel` will continue to initialize the local transport and carry `TInternalMessage` values. The channel contract documentation will clarify that `onMessage()` must be usable before `initialize()` completes so the bridge can subscribe before any inbound frame is possible.

This keeps one protocol across iframe, worker, service-worker, Chrome, and custom transports. Moving negotiation into each channel was rejected because channels do not own namespace or protocol-version semantics and transport-specific implementations would drift.

### Use symmetric HELLO announcements without HELLO_RESPONSE

After registering its message handler and completing local channel initialization, every bridge sends one `HELLO`. Startup discovery has no timer-driven `HELLO` polling:

- if the later endpoint is worker, its initial `HELLO` reaches main;
- if the later endpoint is main, its initial `HELLO` reaches worker and worker re-announces itself using another `HELLO`;
- if both endpoints are ready, their initial `HELLO` frames cross safely.

Reactive re-announcement is the same idempotent `HELLO` control frame, not a semantically distinct response type. This is recorded durably in [ADR 0001](../../../.ai/adr/0001-core-handshake-protocol.md).

Alternative: main periodically sends `HELLO` until worker responds. Rejected because late-loading iframe and worker contexts turn normal startup latency into unnecessary protocol traffic.

Alternative: choose a channel-specific initiator. Rejected because startup order varies even within one transport and would leak discovery policy into every driver.

### Use HELLO, SELECT, CONNECTED, and REJECT control frames

The internal wire contract becomes a discriminated union of application and control envelopes. The exact TypeScript layout can be refined during implementation without changing these fields or semantics:

```typescript
type THandshakeHello = {
  family: 'control';
  type: 'hello';
  protocolVersion: 1;
  namespace: string;
  endpointId: string;
  sender: 'main' | 'worker';
};

type THandshakeSelect = {
  family: 'control';
  type: 'select';
  protocolVersion: 1;
  namespace: string;
  endpointId: string;
  targetEndpointId: string;
  sender: 'main';
  sessionId: string;
};

type THandshakeConnected = {
  family: 'control';
  type: 'connected';
  protocolVersion: 1;
  namespace: string;
  endpointId: string;
  targetEndpointId: string;
  sender: 'worker';
  sessionId: string;
};

type THandshakeReject = {
  family: 'control';
  type: 'reject';
  protocolVersion: 1;
  namespace: string;
  endpointId: string;
  targetEndpointId: string;
  sender: 'main' | 'worker';
  reason: 'incompatible-version' | 'busy' | 'invalid-selection';
};
```

There is intentionally no `hello-response` type. A `HELLO` contains enough information for main to select a worker and for worker to re-announce itself after observing a newly initialized main.

Main chooses the first compatible worker observed while handshaking, generates `sessionId`, and retries the same `SELECT` if `CONNECTED` is not observed. Worker accepts the first valid `SELECT` addressed to its endpoint, records the session, sends `CONNECTED`, and resends `CONNECTED` for a duplicate matching `SELECT`. A selection for another endpoint is ignored. A conflicting selection after worker is connected is rejected as busy.

Alternative: two-frame `HELLO`/`ACK`. Rejected because it cannot unambiguously select one endpoint when several workers share a broadcast transport.

Alternative: retain an `OFFER` frame. Rejected because worker `HELLO` already advertises the endpoint; an additional offer duplicates the same information.

### Address all application envelopes to the negotiated session

Application request, response, and error variants gain `family: 'application'`, `sessionId`, `endpointId`, and `targetEndpointId`. Inbound processing validates the namespace, session, source endpoint, target endpoint, and complementary sender role before routing a request or resolving a pending request.

`TInternalMessage` remains the public name consumed by `IChannel` and `TSerializer`, but becomes the union of application and control envelopes. This minimizes interface churn while making the wire-contract expansion explicit. Custom serializers must preserve both families.

Alternative: filter only by `sessionId`. Rejected because explicit endpoint addressing makes broadcast behavior auditable and prevents an unrelated endpoint that learned a session identifier from being treated as the selected peer.

### Separate local channel readiness from bridge protocol readiness

`channel.isReady()` keeps its current local meaning. `Bridge` owns a single deferred initialization/handshake result:

```text
subscribe to channel messages
        ↓
initialize local channel
        ↓
send HELLO and await negotiation
        ↓
establish session or reject readiness
```

`Bridge.isReady()` returns true only for an established session. `Bridge.ready(): Promise<void>` exposes the shared readiness result; repeated calls observe the same settlement. Initialization errors, handshake rejection, handshake timeout, and destruction reject that result.

Dispatch validates the application message, awaits `ready()`, then creates and sends the session-addressed request. The existing application request timeout starts only when the request frame is sent, so handshake wait does not consume the request-response budget.

Alternative: reject every dispatch before readiness. Rejected because it preserves startup races and forces every consumer to sequence bridge construction manually even though dispatch already returns a promise.

### Gate inbound protocol processing on completed local initialization

The receiver remains registered before `channel.initialize()` so transports cannot miss frames that arrive during setup. However, `Bridge` will not interpret or answer any inbound protocol frame until local initialization has completed successfully. In particular, an early peer `HELLO` is ignored rather than causing `SELECT`, `CONNECTED`, `REJECT`, or a reactive `HELLO` to be sent through a channel that is not ready yet.

No pre-initialization protocol queue is needed. The symmetric protocol already guarantees that every endpoint sends `HELLO` after its own initialization; the later post-initialization announcement either reaches main directly or causes worker to re-announce. This makes ignored early announcements recoverable without introducing ordering, deduplication, or stale-frame semantics for a queue.

Alternative: buffer control frames received during initialization and replay them afterward. Rejected because it adds state and replay ordering while providing no additional convergence guarantee over the mandatory post-initialization `HELLO` exchange.

Initialization failure remains terminal. Send failures that occur after local initialization also remain protocol failures; only the pre-initialization delivery window is gated.

Destruction can race with an asynchronous `channel.initialize()`. `destroy()` performs immediate channel cleanup, and when a pending initializer later settles successfully, the bridge observes its destroyed state and invokes `channel.destroy()` again before returning. This second cleanup closes resources that a channel initializer may have recreated after the first call and prevents a late `HELLO`.

### Revalidate dispatch lifecycle after asynchronous middleware

Application send middleware is an asynchronous boundary between initial readiness validation and actual transport send. After middleware settles, dispatch will re-check that the bridge is not destroyed and that the same active session and selected peer are still valid before allocating pending-request state or calling `channel.send()`.

If destruction occurred while middleware was pending, dispatch rejects with the bridge-destroyed error and emits no application frame. This check complements `destroy()` cleanup: cleanup handles requests that were already registered, while the post-middleware guard prevents a not-yet-registered request from escaping after destruction.

Alternative: rely on each channel to reject sends after its own destruction. Rejected because post-destroy dispatch behavior is a bridge lifecycle guarantee and custom channels are not required to enforce it consistently.

### Use bounded selection retry, not discovery polling

Handshake configuration is nested under `TBridgeConfig.handshake`:

```typescript
type THandshakeConfig = {
  timeout?: number;
  retryInterval?: number;
};
```

The planned defaults are a 10,000 ms handshake timeout and a 1,000 ms selection retry interval. The timeout starts after local channel initialization succeeds. `HELLO` is sent on initialization and reactively when needed, but not on a periodic discovery timer. Only main retries an already-addressed `SELECT`; duplicate selection is idempotent and causes worker to resend `CONNECTED`.

This distinguishes ordinary peer startup latency from recovery after a known peer fails to confirm a selected session. Existing request `timeout` and `retries` fields keep their current meaning and are not repurposed.

### Treat protocol compatibility as an exact version match initially

The first protocol version is `1`. Two endpoints are compatible only when version values are equal. Unaddressed `HELLO` announcements from another namespace or an incompatible protocol version are ignored because shared transports legitimately carry several independent endpoints and protocol generations. This lets main continue discovery until it observes a compatible worker. An incompatible addressed `SELECT` or `CONNECTED` is rejected and fails readiness with a useful protocol-version error.

Version ranges and application-schema fingerprints are deferred. Payload types do not exist at runtime, and strict message-list equality would reject additive namespace evolution.

### Validate protocol envelopes before routing them

Transport and serializer boundaries are runtime trust boundaries even though `IChannel` exposes `TInternalMessage` statically. An `isControlMessage` guard identifies the control family before the bridge dispatches a fully validated envelope into the handshake state machine. Control validation covers the known discriminator, numeric protocol version, namespace, non-empty endpoint identifiers, sender role, addressed target, non-empty session identifier for `SELECT` and `CONNECTED`, and the enumerated rejection reason for `REJECT`.

Unknown and malformed control envelopes are ignored. They do not produce `REJECT`, settle readiness, reserve a peer, or establish a session. This keeps arbitrary transport input from being interpreted as a terminal rejection and prevents an incomplete `SELECT` from making a worker ready.

An `isApplicationMessage` guard validates the application-family discriminator, known request/response/error type, namespace, endpoint and session addressing, sender role, identifiers, and presence of the type-specific `data` or `error` field before normal application routing. Unknown families and malformed application envelopes are ignored, so a forged object cannot fall through to error handling and reject an unrelated in-flight request.

Alternative: treat every `family: 'control'` object not recognized as `HELLO`, `SELECT`, or `CONNECTED` as `REJECT`. Rejected because an unknown discriminator or missing field is not authenticated protocol intent and can otherwise terminate readiness with invalid state.

### Keep the first implementation one-to-one and non-reconnecting

One bridge has at most one active session. After connection, unrelated `HELLO` announcements do not replace the peer. Destroying the bridge clears timers, rejects pending readiness and application requests, and makes later frames inert.

Service-worker and extension drivers that serve multiple clients must construct a logical channel/bridge per client or introduce a later routing capability. Automatic peer replacement requires heartbeat or transport-disconnect semantics and is intentionally not inferred from `HELLO` traffic.

## Risks / Trade-offs

- **[Breaking wire contract]** Existing custom serializers may assume only request, response, and error variants. → Export discriminated control/application types, update documentation, add compile-time fixtures, and release `@tschannel/core` with a minor pre-1.0 change (`0.0.x` to `0.1.0`).
- **[Bundled channel compatibility]** Channel packages currently peer-depend on `^0.0.2`, which excludes `0.1.0`. → Update peer ranges, verify both drivers with control frames, and publish patch releases for affected channel packages.
- **[Broadcast races]** Several workers can announce concurrently. → Main commits to one endpoint with addressed `SELECT`; session and endpoint filters exclude other responders.
- **[No liveness after connection]** A completed handshake does not prove the peer remains alive. → Document the guarantee precisely and defer heartbeat/reconnect to a separate capability.
- **[HELLO loss on unreliable custom transports]** Discovery does not continuously poll. → Require channels to provide reliable ordered delivery once locally ready; use reactive re-announcement to cover startup ordering, and document stronger delivery recovery as a future transport/reconnect concern.
- **[Listener-before-initialize compatibility]** A custom channel may assume `onMessage()` is called only after initialization. → Update the `IChannel` contract and migration guide, and include a compatibility test channel with asynchronous initialization and early inbound delivery.
- **[Early inbound frame during initialization]** Receiver-first registration can expose a peer frame before the local channel permits sends. → Gate protocol processing until local initialization succeeds and verify convergence through the later symmetric `HELLO` exchange.
- **[Asynchronous middleware outlives the bridge]** Middleware can resume after `destroy()` and otherwise attempt a stale send. → Revalidate destruction and active-session identity after middleware settles, before registering or sending the request.
- **[Initialization outlives the bridge]** A channel can recreate local resources after an earlier `destroy()` returns. → Repeat channel cleanup when pending initialization settles after bridge destruction.
- **[Protocol frames exposed through public internal types]** Consumers and serializers can supply malformed frames at runtime. → Validate family and type discriminants, version representation, role, addressing, session, and type-specific fields before routing; ignore invalid envelopes.

## Migration Plan

1. Introduce control/application envelope types, protocol constants, handshake configuration, and focused protocol tests in `@tschannel/core`.
2. Refactor bridge initialization to install the receiver before channel initialization and expose the shared readiness promise.
3. Add the handshake state machine, session filtering, pre-ready dispatch sequencing, timer cleanup, and failure behavior.
4. Verify iframe and PubSub channels transport both envelope families; update their peer dependency ranges only where required by the released core version.
5. Update public documentation and custom channel/serializer examples to distinguish channel readiness from bridge readiness.
6. Add Changesets: minor for `@tschannel/core` and patch for bundled channel packages whose compatibility metadata or implementation changes.
7. Add regression coverage for inbound delivery during pending initialization and destruction during asynchronous send middleware; update the ADR with these lifecycle boundaries.
8. Restore the lockfile's pnpm-owned formatting and regenerate only the dependency changes required by this change.
9. Add runtime application-envelope validation and repeat channel cleanup when asynchronous initialization settles after destruction.

Rollback requires reverting core, bundled channel peer-range changes, documentation, and their Changesets together because old and new wire protocols do not interoperate.
