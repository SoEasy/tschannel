## Purpose

Define how bridge middleware transforms application payloads and observes the ordered lifecycle of application exchanges and handshake control frames without gaining control over protocol continuation.

## ADDED Requirements

### Requirement: Application transformation stages continue automatically

The bridge SHALL retain the `onBeforeSend`, `onBeforeHandle`, `onAfterHandle`, and `onAfterReceive` transformation stages in that order along a successful request/response exchange. Registered transformation hooks for a stage SHALL run in registration order, and the stage SHALL pass its input through unchanged when no hook is registered. Middleware SHALL NOT need or receive a `next` callback to continue a message. Handshake control frames SHALL NOT enter these application transformation stages.

#### Scenario: Request and response are transformed

- **WHEN** main dispatches a request and worker handles it with transformation hooks registered at all four stages
- **THEN** each stage receives the result of the preceding stage on its own bridge
- **AND** the caller receives the result of `onAfterReceive`

#### Scenario: A transformation stage has no hook

- **WHEN** an application message reaches a stage with no registered transformation hook
- **THEN** it continues with the same value and no explicit continuation call is needed

### Requirement: Observer receives ordered application lifecycle phases

`TBridgeMiddleware` SHALL offer an `observe` hook receiving a message view and a named phase. For a successful application exchange, the sending bridge SHALL report `dispatchStarted`, `sendPrepared`, and `requestSent` for the request, followed by `responseReceived` and `completed` for the response. The receiving bridge SHALL report `requestReceived`, `handlePrepared`, `handled`, `responsePrepared`, and `responseSent` in that order. A bridge SHALL report these phases when `observe` is registered, whether or not any transformation hook is registered. A phase ending in `Sent` SHALL mean the frame was submitted to the local channel, not that the channel completed delivery or the remote endpoint received it.

#### Scenario: Both bridges observe a successful exchange

- **WHEN** main dispatches `getAge`, worker returns `{ age: "25" }`, and `onAfterReceive` transforms it to `{ age: 25 }`
- **THEN** main observes `dispatchStarted`, `sendPrepared`, `requestSent`, `responseReceived` with `{ age: "25" }`, and `completed` with `{ age: 25 }` in that order
- **AND** worker observes `requestReceived`, `handlePrepared`, `handled`, `responsePrepared`, and `responseSent` in that order

#### Scenario: No transformation hook is registered

- **WHEN** an observer is registered but `onBeforeSend` and `onAfterReceive` are absent
- **THEN** it still receives `sendPrepared` and `completed`
- **AND** the values at those phases are unchanged by their respective stages

### Requirement: Observed application events identify their exchange

Application phase notifications SHALL identify the message name, namespace, request/response direction, and one stable exchange identifier shared by the request, response, and local failure notifications. The view SHALL represent the value at the named phase, including the output of a completed transformation stage. A bridge SHALL report `requestReceived` and `responseReceived` only for valid application frames admitted to its active session; ignored malformed, unaddressed, or foreign-session frames SHALL NOT produce application lifecycle notifications.

#### Scenario: Two requests are in flight

- **WHEN** two requests with the same message name are concurrently in flight
- **THEN** an observer can distinguish their phase notifications by exchange identifier

#### Scenario: Foreign-session response arrives

- **WHEN** a bridge ignores a response from a foreign session
- **THEN** it does not report `responseReceived` or `completed` for that response

### Requirement: Observer reports terminal failure

An observed exchange SHALL report `failed` with the exchange identifier, failing stage, and error when it terminates without `completed`. This includes transformation or handler failure, missing handler, response error, request timeout, readiness failure, and destruction while the exchange is pending. Each bridge SHALL report the failure it observes; a remote handler failure is therefore reported once on the worker and again when its error response reaches the caller. No successful `completed` phase SHALL follow `failed` for the same exchange on one bridge.

#### Scenario: Handler throws

- **WHEN** a worker handler throws while handling a request
- **THEN** the worker observer receives `failed` identifying the handling stage and error
- **AND** the caller observer receives `failed` when the error response terminates its exchange

#### Scenario: Request times out

- **WHEN** a sent request receives no response before its timeout
- **THEN** the sending bridge reports `failed` with the request identifier and a timeout error

### Requirement: Observation cannot control bridge outcomes

The bridge SHALL ignore the return value of `observe`, SHALL NOT wait for a returned promise, and SHALL contain both synchronous throws and asynchronous rejections from `observe`. One observer's error SHALL NOT stop delivery to other observers or change application results, control-frame contents, handshake readiness, or failure outcomes. The control-frame view supplied to an observer SHALL be detached from the frame used by the protocol so observer mutation cannot change handshake behavior.

#### Scenario: Observer returns a never-settling promise

- **WHEN** `observe` returns a promise that never settles during an application exchange or handshake
- **THEN** the bridge continues the exchange or negotiation without waiting for that promise

#### Scenario: Observer throws while seeing a control frame

- **WHEN** an observer throws or attempts to mutate its control-frame view
- **THEN** the handshake continues according to the original valid frame and other observers still receive their notifications

### Requirement: Observer can trace admitted handshake frames

When an observer is registered, the bridge SHALL report `controlSent` when a handshake frame is submitted to the local channel and `controlReceived` when a well-formed, relevant handshake frame is admitted for protocol processing. These notifications SHALL identify the control type and endpoint information available in the frame. Ignored malformed, unrelated-namespace, wrong-sender, or wrong-target control frames SHALL NOT produce `controlReceived`. Handshake readiness failure SHALL be reported as `failed` with a control context and error. A bridge SHALL only report events that occur after the observer is registered.

#### Scenario: Successful handshake is observed

- **WHEN** observers are registered on both endpoints before their handshake frames are exchanged
- **THEN** they can observe their locally sent and admitted `HELLO`, `SELECT`, and `CONNECTED` frames through `controlSent` and `controlReceived`
- **AND** application transformation hooks are not invoked for those frames

#### Scenario: Addressed rejection fails readiness

- **WHEN** a bridge receives a valid addressed `REJECT` that fails readiness
- **THEN** it reports `controlReceived` for that frame and `failed` for readiness
