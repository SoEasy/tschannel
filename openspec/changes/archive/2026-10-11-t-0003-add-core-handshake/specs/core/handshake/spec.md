## Purpose

Define how two tschannel bridge endpoints discover one another, establish an isolated protocol session, and expose readiness before application messages are exchanged.

## ADDED Requirements

### Requirement: Protocol handshake ownership

The core bridge protocol SHALL own handshake negotiation independently of transport-specific channel implementations. A channel SHALL provide local transport initialization and delivery of protocol envelopes, while the bridge SHALL interpret handshake control frames and determine remote readiness.

#### Scenario: Use a transport without a channel-specific handshake

- **WHEN** a channel can initialize locally and carry core protocol envelopes in both directions
- **THEN** two bridges using that channel complete the same core handshake without a transport-specific handshake state machine

### Requirement: Symmetric endpoint announcement

Each bridge endpoint SHALL send a `HELLO` control frame after its incoming-message handler is registered and its local channel initialization succeeds. `HELLO` SHALL identify the endpoint, role, namespace, and protocol version. The protocol SHALL NOT define a separate `HELLO_RESPONSE` frame; an endpoint that needs to announce itself in reaction to a peer `HELLO` SHALL send another idempotent `HELLO` frame.

#### Scenario: Main initializes before worker

- **WHEN** main initializes before worker and its first `HELLO` is not observed by a peer
- **THEN** the later-initializing worker sends `HELLO`
- **AND** main can continue negotiation without periodically probing for the worker

#### Scenario: Worker initializes before main

- **WHEN** worker initializes before main and its first `HELLO` is not observed by a peer
- **THEN** the later-initializing main sends `HELLO`
- **AND** worker re-announces itself with the same `HELLO` frame type
- **AND** the protocol does not emit a `HELLO_RESPONSE` frame

#### Scenario: Endpoints initialize concurrently

- **WHEN** main and worker are both locally initialized
- **THEN** each endpoint's `HELLO` can be received and processed idempotently regardless of delivery order

#### Scenario: Peer hello arrives during local initialization

- **WHEN** a transport delivers a peer `HELLO` after the receiver is registered but before local channel initialization succeeds
- **THEN** the receiving bridge does not send a protocol frame through the not-yet-initialized channel
- **AND** the early frame does not permanently fail bridge readiness
- **AND** negotiation can proceed from the symmetric `HELLO` announcements sent after local initialization succeeds

### Requirement: Protocol compatibility

Endpoints SHALL negotiate only when their roles are complementary, their namespace names match, and their core protocol versions are compatible. An explicitly addressed incompatible negotiation SHALL terminate with a protocol rejection that identifies the incompatibility.

#### Scenario: Compatible endpoints meet

- **WHEN** main and worker exchange `HELLO` frames with the same namespace and a compatible protocol version
- **THEN** main can select the worker for session establishment

#### Scenario: Protocol versions are incompatible

- **WHEN** an endpoint receives an addressed handshake frame for the same namespace with an incompatible protocol version
- **THEN** the handshake fails with a protocol-version incompatibility error

#### Scenario: Incompatible announcement is observed on a shared transport

- **WHEN** a bridge receives an unaddressed `HELLO` for the same namespace with an incompatible protocol version
- **THEN** it ignores that announcement without failing its own handshake
- **AND** it remains able to select a later compatible endpoint

#### Scenario: Unrelated namespace announcement is observed

- **WHEN** a bridge receives an unaddressed `HELLO` for another namespace on a shared transport
- **THEN** it ignores that announcement without failing its own handshake

### Requirement: Main selects one worker session

Main SHALL select one compatible worker endpoint, create a unique session identifier, and address a `SELECT` control frame to that worker. Only the selected worker SHALL accept the session and return `CONNECTED`; other workers SHALL remain outside the session.

#### Scenario: One worker is available

- **WHEN** main observes a compatible worker `HELLO`
- **THEN** main sends `SELECT` addressed to that worker with a new session identifier
- **AND** the worker returns `CONNECTED` for the same session

#### Scenario: Multiple workers are visible

- **WHEN** multiple compatible workers announce themselves on one shared transport
- **THEN** main selects at most one worker for its bridge session
- **AND** unselected workers do not become ready for that session

#### Scenario: Selection targets another worker

- **WHEN** a worker observes a `SELECT` addressed to a different endpoint identifier
- **THEN** it ignores the selection and does not adopt the session identifier

### Requirement: Bridge readiness reflects protocol readiness

Bridge readiness SHALL mean that local channel initialization succeeded and the remote endpoint completed session establishment. `Bridge.isReady()` SHALL return `true` only in that state, and `Bridge.ready()` SHALL return an awaitable result that fulfills when the session is established or rejects when initialization, negotiation, timeout, or destruction prevents readiness.

#### Scenario: Local channel is ready but no peer exists

- **WHEN** local channel initialization has completed but no compatible peer has completed the handshake
- **THEN** `Bridge.isReady()` returns `false`
- **AND** `Bridge.ready()` remains pending until the handshake succeeds or fails

#### Scenario: Worker accepts the selected session

- **WHEN** worker accepts an addressed `SELECT` and sends `CONNECTED`
- **THEN** worker becomes ready for that session
- **AND** main becomes ready after receiving the matching `CONNECTED`

#### Scenario: Initialization fails

- **WHEN** local channel initialization rejects or throws
- **THEN** `Bridge.ready()` rejects with the initialization failure
- **AND** `Bridge.isReady()` remains `false`

#### Scenario: Bridge is destroyed before readiness

- **WHEN** a bridge is destroyed while `Bridge.ready()` is pending
- **THEN** the readiness result rejects with a bridge-destroyed error
- **AND** no later control frame can make that bridge ready

#### Scenario: Channel initialization finishes after bridge destruction

- **WHEN** a bridge is destroyed while asynchronous channel initialization is pending
- **AND** that initialization later completes and may reactivate local transport resources
- **THEN** the bridge invokes channel cleanup again after initialization settles
- **AND** it sends no `HELLO` and remains not ready

### Requirement: Dispatch waits for handshake readiness

Application dispatch initiated before protocol readiness SHALL wait for the bridge readiness result and SHALL NOT send an application frame through the channel before a session is established.

#### Scenario: Dispatch begins while handshake is pending

- **WHEN** an application calls `dispatch()` after local construction but before session establishment
- **THEN** the dispatch waits for `Bridge.ready()`
- **AND** sends the request only after the bridge is ready

#### Scenario: Handshake fails while dispatch waits

- **WHEN** a pending dispatch is waiting for readiness and the handshake fails or times out
- **THEN** the dispatch rejects with the handshake failure
- **AND** no application request frame is sent

#### Scenario: Bridge is destroyed while asynchronous send middleware is pending

- **WHEN** a ready bridge begins a dispatch and asynchronous send middleware has not completed
- **AND** the bridge is destroyed before that middleware completes
- **THEN** the dispatch rejects with a bridge-destroyed error
- **AND** no application request frame is sent after destruction

### Requirement: Handshake timeout and idempotent recovery

Handshake processing SHALL be idempotent and bounded by a separately configurable handshake timeout. Initial peer discovery SHALL be driven by endpoint `HELLO` announcements rather than continuous polling. After a peer is known, main MAY retry an unconfirmed `SELECT`, and a worker receiving a duplicate matching `SELECT` SHALL resend `CONNECTED` without creating another session.

#### Scenario: Peer never appears

- **WHEN** no compatible peer is discovered before the configured handshake timeout
- **THEN** `Bridge.ready()` rejects with a handshake-timeout error
- **AND** the bridge does not continue sending discovery messages after the timeout

#### Scenario: Connected confirmation is lost

- **WHEN** main has selected a worker but does not receive the matching `CONNECTED`
- **THEN** main can retry the same addressed `SELECT` within the handshake timeout
- **AND** the worker returns `CONNECTED` for the existing session without allocating a new session

#### Scenario: Duplicate hello is received

- **WHEN** an endpoint receives the same peer's `HELLO` more than once during negotiation
- **THEN** it processes the announcement without creating duplicate readiness results or sessions

### Requirement: Session-isolated application traffic

Every application request, response, and error frame sent after handshake SHALL identify the negotiated session. A bridge SHALL process application frames only when they belong to its active session and come from the selected peer role.

Before routing an inbound application envelope, a bridge SHALL validate its application-family discriminator, known request/response/error type, namespace, endpoint and session addressing, sender role, identifiers, and type-specific payload field. Unknown or malformed application envelopes SHALL be ignored without invoking application handlers or settling pending requests.

#### Scenario: Active-session application frame arrives

- **WHEN** a bridge receives an application frame carrying its active session identifier from the complementary peer
- **THEN** it processes the frame through the normal request, response, or error flow

#### Scenario: Foreign-session application frame arrives

- **WHEN** a bridge receives an application frame with an unknown or stale session identifier
- **THEN** it ignores the frame without invoking application handlers or resolving pending requests

#### Scenario: Application frame arrives before handshake

- **WHEN** a bridge receives an application frame before it has an active session
- **THEN** it ignores the frame without changing readiness

#### Scenario: Malformed application envelope targets an active request

- **WHEN** a bridge receives an envelope with an unknown family or application `type` whose identifiers match an active request
- **THEN** it ignores the envelope
- **AND** it does not invoke an application handler or settle the pending request

### Requirement: Control-frame isolation

Handshake control frames SHALL pass through the channel serializer and transport but SHALL NOT invoke application message handlers, application middleware, or application pending-request resolution.

Before changing handshake state, a bridge SHALL validate the control-frame discriminator, protocol version representation, namespace, endpoint identity, sender role, addressing, session identifier, and rejection reason required by that frame type. Unknown or malformed control frames SHALL be ignored without settling readiness or creating a session.

#### Scenario: Handshake frame traverses a custom serializer

- **WHEN** a bridge sends a handshake control frame through a channel configured with a custom serializer
- **THEN** the serializer can preserve and restore that frame as part of the core protocol envelope

#### Scenario: Middleware is registered during handshake

- **WHEN** handshake control frames are exchanged while application middleware is registered
- **THEN** application middleware hooks are not invoked for those control frames

#### Scenario: Unknown control frame is received

- **WHEN** a bridge receives a same-namespace control envelope with an unknown `type`
- **THEN** it ignores the envelope without rejecting readiness

#### Scenario: Selection omits its session identifier

- **WHEN** a worker receives an addressed `SELECT` without a non-empty session identifier
- **THEN** it ignores the malformed selection
- **AND** it does not become ready or send `CONNECTED`

### Requirement: One logical peer session per bridge

A bridge SHALL maintain at most one active main-to-worker session. Establishing multi-peer routing, heartbeat-based liveness, or automatic reconnection after peer replacement SHALL require separate capabilities.

#### Scenario: Another peer announces after connection

- **WHEN** a bridge already has an active session and another compatible endpoint sends `HELLO`
- **THEN** the active session is not silently replaced

#### Scenario: Connected peer restarts

- **WHEN** the connected peer is replaced after handshake and no reconnect capability is configured
- **THEN** the existing bridge does not automatically establish a replacement session
