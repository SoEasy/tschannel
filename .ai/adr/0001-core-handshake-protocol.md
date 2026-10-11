# ADR-0001: Own a symmetric handshake in the core protocol

- Status: proposed
- Date: 2026-10-11
- Related: [OpenSpec change t-0003-add-core-handshake](../../openspec/changes/t-0003-add-core-handshake/)
- Supersedes: none
- Superseded by: none

## Context and Problem Statement

A tschannel bridge currently reports readiness when its local channel has initialized. That state does not establish that a complementary remote bridge exists, speaks a compatible protocol, or is ready to receive application frames. Startup order varies by execution context: main commonly precedes iframe and worker code, while DevTools or extension contexts can appear in the reverse order.

The architecture needs one transport-independent rule for peer discovery and session establishment. It must not make main continuously probe while a spawned context loads, and it must not require every channel package to implement its own interpretation of namespace, protocol version, endpoint selection, and bridge readiness.

## Decision Drivers

- Handshake behavior must be consistent across bundled and custom channels.
- Either endpoint may initialize first without creating a permanent initiator role.
- Normal startup latency must not cause continuous discovery polling.
- The protocol must select one worker when a transport exposes several endpoints.
- Application traffic must be isolated from unrelated endpoints on shared transports.
- Channel implementations must remain focused on local transport setup and frame delivery.
- The protocol must have an awaitable readiness guarantee and deterministic failure behavior.

## Considered Options

1. Keep local channel readiness as bridge readiness and leave startup sequencing to consumers.
2. Make main repeatedly send handshake probes until worker responds.
3. Implement a separate handshake state machine in each channel package.
4. Implement one symmetric core handshake in which both endpoints announce themselves with the same `HELLO` frame and main selects the session.

## Decision Outcome

We will implement a symmetric handshake in the `@tschannel/core` bridge protocol. Each endpoint sends `HELLO` after local subscription and channel initialization. Main coordinates endpoint selection and session creation, but neither role is the permanent handshake initiator. The protocol defines no `HELLO_RESPONSE`; reactive announcement uses the same idempotent `HELLO` frame.

The control-frame progression is:

```text
HELLO      announce endpoint identity, role, namespace, and protocol version
SELECT     main chooses one worker and proposes a session identifier
CONNECTED  selected worker confirms the session
REJECT     an addressed peer reports a terminal incompatibility or conflict
```

The `HELLO` schema is:

```text
HELLO {
  family:          "control"
  type:            "hello"
  protocolVersion: 1
  namespace:       string
  endpointId:      string
  sender:          "main" | "worker"
}
```

There is deliberately no schema named `HELLO_RESPONSE`. When an endpoint must make itself visible after receiving a peer announcement, it emits another `HELLO` with its own identity.

### Main initializes first

The early `HELLO` can be unobserved because worker code has not loaded. Worker initialization supplies the announcement that continues negotiation; main does not poll continuously.

```text
MAIN                                      WORKER

register receiver
initialize channel
HELLO ────────────────▶ unobserved

                                          register receiver
                                          initialize channel
                         ◀─────────────── HELLO
SELECT(session, worker) ─────────────────▶
                         ◀─────────────── CONNECTED(session)

ready                                     ready
```

### Worker initializes first

The early worker announcement can be unobserved. Main later announces itself; worker makes its own identity visible with the same `HELLO` type. This is another announcement, not a `HELLO_RESPONSE` message.

```text
MAIN                                      WORKER

                                          register receiver
                                          initialize channel
            unobserved ◀──────────────── HELLO

register receiver
initialize channel
HELLO ───────────────────────────────────▶
                         ◀─────────────── HELLO
SELECT(session, worker) ─────────────────▶
                         ◀─────────────── CONNECTED(session)

ready                                     ready
```

### Both endpoints are available

Both initial announcements can cross. Duplicate announcements are idempotent and do not create duplicate sessions.

```text
MAIN                                      WORKER

HELLO ───────────────────────────────────▶
                         ◀─────────────── HELLO
SELECT(session, worker) ─────────────────▶
                         ◀─────────────── CONNECTED(session)
```

Main may retry an already addressed `SELECT` within a bounded handshake timeout. A worker that receives the same valid `SELECT` again resends `CONNECTED` for the existing session. Initial peer discovery remains announcement-driven rather than timer-driven.

An unaddressed `HELLO` with an incompatible protocol version is another shared-transport announcement and is ignored. It cannot fail readiness or prevent main from selecting a later compatible worker. Once negotiation is explicitly addressed with `SELECT` or `CONNECTED`, a version mismatch is terminal and produces an addressed `REJECT`.

Every protocol envelope is validated at the transport boundary before it is routed. An `isControlMessage` guard selects the control family, after which unknown control types, missing or empty endpoint/session identifiers, invalid sender roles, invalid targets, and invalid rejection reasons are ignored. An `isApplicationMessage` guard likewise requires a known request/response/error discriminator, valid identifiers and addressing, and the corresponding `data` or `error` field. In particular, an arbitrary object is never inferred to be `REJECT` or an application error, a malformed `SELECT` cannot make a worker ready, and malformed application input cannot settle a pending request.

Application frames carry the negotiated session and endpoint addressing. Frames outside the active session are ignored. `channel.isReady()` continues to describe local transport readiness, while bridge readiness describes a completed protocol session.

### Frames received during local initialization

The bridge registers its receiver before calling `channel.initialize()` so a transport can establish listeners during setup. A transport may therefore deliver a peer frame while local initialization is still pending. The bridge ignores protocol frames in this interval and never answers them through the not-yet-initialized channel.

The protocol does not buffer these early frames. After initialization succeeds, every endpoint sends its mandatory `HELLO`; that symmetric announcement either reaches main directly or causes worker to re-announce with the same `HELLO` type. Negotiation therefore converges without replay state and still defines no `HELLO_RESPONSE`.

If the bridge is destroyed while asynchronous channel initialization is still pending, it cleans up the channel immediately and repeats `channel.destroy()` when that initializer later settles successfully. This closes resources that late initialization may recreate and prevents any post-destroy `HELLO`.

### Dispatch crossing asynchronous middleware

Application send middleware can remain pending after a ready bridge begins dispatch. Before registering the pending request or sending its application frame, the bridge revalidates that it has not been destroyed and that the negotiated session and selected peer still match the values captured before middleware execution.

If destruction occurs while middleware is pending, dispatch rejects with the bridge-destroyed error and sends no application frame. This lifecycle guarantee belongs to the bridge and does not depend on a channel rejecting post-destroy sends.

### Consequences

- Positive: All transports share one namespace-aware, versioned handshake contract.
- Positive: Normal iframe and worker startup latency does not cause main to poll continuously.
- Positive: Either initialization order converges using one `HELLO` frame type.
- Positive: Main can select one worker and isolate a logical session on a broadcast transport.
- Positive: Early inbound delivery during local initialization cannot trigger a premature protocol send or permanently fail readiness.
- Positive: Asynchronous application middleware cannot leak a request after bridge destruction.
- Positive: Late asynchronous channel initialization cannot reactivate a destroyed bridge's transport resources.
- Positive: Malformed or unknown control and application envelopes cannot settle readiness, establish an invalid session, invoke handlers, or settle pending requests.
- Positive: An incompatible broadcast announcement cannot prevent selection of another compatible worker.
- Negative: The internal wire envelope and `Bridge.isReady()` semantics change incompatibly for existing consumers.
- Negative: Custom serializers must preserve control frames in addition to application frames.
- Negative: The initial design does not detect a peer that disappears after connection.
- Neutral: Main remains the session coordinator even though it is not the permanent discovery initiator.
- Neutral: Multi-peer routing, automatic reconnect, heartbeat, authentication, and application-schema negotiation remain separate concerns.

## Confirmation

Compliance is confirmed by automated tests that cover main-first, worker-first, and concurrent initialization; deliver a peer `HELLO` while local initialization is pending; destroy a bridge before initialization settles and verify repeated channel cleanup; assert that no `HELLO_RESPONSE` frame exists or is emitted; verify selection retry and duplicate-frame idempotence; verify that only one worker joins a session; ignore malformed and unknown control and application frames; continue discovery after an incompatible broadcast `HELLO`; verify that foreign-session application frames are ignored; and destroy a bridge while asynchronous send middleware is pending to prove that no application frame is emitted. API extraction and package builds must confirm the published readiness and protocol-envelope types.

The OpenSpec change must validate successfully, bundled iframe and PubSub channel tests must pass with control frames, and documentation must distinguish local channel readiness from bridge protocol readiness.

## More Information

- [Change proposal](../../openspec/changes/t-0003-add-core-handshake/proposal.md)
- [Handshake specification](../../openspec/changes/t-0003-add-core-handshake/specs/core/handshake/spec.md)
- [Handshake design](../../openspec/changes/t-0003-add-core-handshake/design.md)
