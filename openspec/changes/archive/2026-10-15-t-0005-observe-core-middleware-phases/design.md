## Context

See [proposal.md](proposal.md) for the motivation and [core/middleware](specs/core/middleware/spec.md) for the lifecycle contract. Today `Bridge.use()` stores `TBridgeMiddleware` objects. Four payload hooks form independent promise chains; `onError` is a callback. Application requests and responses take different paths through `bridge.ts`, while control frames are sent and handled directly. The public middleware type documents none of these boundaries.

The current `dispatch()` can wait for handshake readiness before sending. Incoming frames are filtered for namespace, shape, endpoint, and session. A channel may deliver synchronously during `send()`, so an observer trace must preserve local phase order even under reentrant delivery.

## Goals / Non-Goals

**Goals:**

- Expose one phase vocabulary for the existing application stages and control-frame visibility.
- Keep observers outside the application transformation chain and outside handshake decision-making.
- Preserve current transformation order, payload values, and normal failure semantics.
- Make a trace usable when middleware hooks are absent or several requests are concurrent.

**Non-Goals:**

- Give middleware a `next`, cancellation, routing, or synthetic-response API.
- Make observation a transport-level wire tap for malformed or foreign frames.
- Guarantee that arbitrary user callback code cannot consume CPU or mutate a shared application payload object.
- Change channel serializers, iframe filtering, peer selection, handshake retries, or reconnect behavior.

## Decisions

### Add a distinct `observe(message, phase)` callback

Extend `TBridgeMiddleware` with an optional observer and export its phase and message-view types. Use a discriminated application/control view: application events carry `namespace`, `name`, `id`, request/response kind, and the value at the phase; control events carry their validated protocol type and available endpoint/session fields. A readiness failure without a particular frame uses a synthetic control handshake context with the error and failing stage. `failed` views carry the error and `failedAt`. The view is an observation record, not necessarily a complete `TInternalMessage`: `dispatchStarted` can precede a negotiated session and transformed values can differ from the wire envelope.

Assign the application exchange ID before `dispatchStarted`, before readiness waiting and middleware execution. Reuse it in the wire request and all later application observations. This permits correlation of concurrent requests and failures before the first send. A bridge that receives a request uses its wire ID for its local trace.

Alternative: reuse `TInternalMessage` directly. Rejected because initial local phases have no complete wire envelope and failure/readiness events are not wire frames.

### Capture phases independently of hook registration

Instrument the lifecycle boundaries, not individual middleware callbacks. For every successful request, capture the ten phases named in the spec. `sendPrepared`, `handlePrepared`, `responsePrepared`, and `completed` are emitted after their respective stage completes even when that stage has no hook, with an unchanged value. With several hooks at one stage, emit one result after the whole chain, not one event per hook. `requestSent`, `responseSent`, and `controlSent` are captured immediately as the frame is submitted to `channel.send()`; a synchronous send error subsequently produces `failed`. This definition avoids misreporting a reentrant receive before its local send attempt.

Incoming `requestReceived` and `responseReceived` are captured after envelope and active-session checks. An application error frame is captured as `responseReceived` and then terminates with `failed`; it does not produce `completed`. A missing handler produces `requestReceived`, then `failed` on the worker and an error frame submitted as `responseSent`. These paths do not invent `handled` or transformation-result phases that did not occur.

Alternative: notify only around hooks that are present. Rejected because the agreed phase model describes message progress and must remain useful without transformation middleware.

### Isolate observation delivery from message progress

At each boundary, capture an event for observers registered at that moment and enqueue observer delivery in capture order. Do not await delivery. Catch synchronous throws and consume returned-promise rejections per observer; continue notifying other observers. Queued delivery may occur after the corresponding dispatch promise settles, so documentation must distinguish capture order from callback timing. Capture `failed` before clearing observers during destruction.

Control frames consist of primitive protocol fields; give observers a detached, read-only control view. A control observer cannot mutate the frame that the state machine or channel uses. Application payloads can be arbitrary user-defined objects, including values supported by custom serializers. Give observers a separate event envelope and type its value as read-only, but do not promise a deep runtime clone of every possible payload. Document that mutating nested application values in `observe` is unsupported. Observer return values and errors never alter application or control flow.

Alternative: invoke observers synchronously and ignore their result. Rejected because a synchronous throw would need special handling on every protocol path and would run user code inside reentrant send/receive stacks. Alternative: await observers. Rejected because an unresolved observer would delay requests or handshake.

### Observe admitted control traffic without transforming it

`controlSent` covers each submitted `HELLO`, `SELECT`, `CONNECTED`, or `REJECT`; `controlReceived` covers structurally valid, relevant frames admitted to handshake processing, including a valid addressed rejection. Validate before capture so unknown, malformed, wrong-namespace, wrong-sender, and wrong-target frames remain invisible to `observe`. Report readiness rejection, timeout, channel initialization/send failure, and destruction as `failed` with control context. Keep application transformation hooks and handlers untouched.

The bridge currently begins asynchronous channel initialization in its constructor, while middleware registers through `use()` afterward. The observer contract therefore starts at registration: it does not replay earlier frames. README examples that need the complete handshake trace should register observers before a deliberately deferred channel initialization completes; the API does not promise replay of an initial `HELLO` already emitted.

Alternative: route control frames through the four application payload hooks and ignore their results. Rejected because those hooks have request/response semantics, may block or mutate the protocol, and cannot represent all control phases truthfully.

### Document public timing and examples

Add JSDoc to each property of `TBridgeMiddleware`, covering invocation point, data transformation or observation authority, possible async behavior, and representative uses. In README, replace the brief middleware subsection with a dedicated explanation of the four transformation hooks, `onError`, `observe`, all successful phases, `failed`, control-frame phases, and an end-to-end `getAge` trace. State that `Sent` means local channel submission, `Received` means an admitted frame, and neither proves remote delivery at the same moment.

## Risks / Trade-offs

- **[Asynchronous observer callbacks see events after the operation advances]** → Define phases by capture points and preserve per-bridge capture order; document that callback execution need not precede `dispatch()` settlement.
- **[An observer mutates an arbitrary nested application payload]** → Use a separate event envelope, mark views read-only in the public type, document unsupported mutation, and guarantee detached control views. A universal deep clone would break support for arbitrary payload objects and custom serializers.
- **[Synchronous channels reenter the bridge during send]** → Capture the `Sent` phase before calling `channel.send()` and follow it with `failed` if that call throws.
- **[Observer work can still occupy the JavaScript thread]** → Do not await observer promises; explicitly avoid claiming protection from infinite loops or heavy synchronous callbacks.
- **[Callbacks added through `use()` miss an early constructor-time handshake event]** → Promise events only after registration and test with a deferred channel when a complete handshake trace is required.
- **[An error path emits duplicate failure information across endpoints]** → Include bridge side, exchange ID, and failing stage; explain that each bridge reports its local outcome.

## Migration Plan

1. Add the additive public observer types and phase capture without changing existing transformation signatures.
2. Add focused lifecycle, failure, handshake, and observer-isolation tests; retain existing transformation tests.
3. Update JSDoc and README; add a Changeset for `@tschannel/core` with a minor-release decision if the API remains additive.
4. Run strict OpenSpec validation and repository quality checks. Rollback removes the new observer API, instrumentation, tests, documentation, and Changeset together; existing middleware use needs no migration.
