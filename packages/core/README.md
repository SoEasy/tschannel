# @tschannel/core

Type-safe namespaces and a transport-independent `Bridge` for tschannel.

```typescript
const bridge = new Bridge(namespace, channel, {
  timeout: 10_000,
  handshake: { timeout: 10_000, retryInterval: 1_000 },
});

await bridge.ready();
```

`Bridge.isReady()` reports protocol readiness: the local channel is initialized and a complementary
main/worker peer has completed `HELLO → SELECT → CONNECTED`. `dispatch()` may be called earlier; it
waits for the same readiness promise and starts its request timeout only after sending.

The protocol selects one worker, requires an exact protocol-version match, and addresses application
traffic by endpoint and session. It has no `HELLO_RESPONSE`, periodic discovery polling, heartbeat,
disconnect detection, peer replacement, or automatic reconnection.

Custom `IChannel` implementations must accept `onMessage()` before `initialize()`. Custom
`TSerializer` implementations must preserve both `family: 'control'` and `family: 'application'`
variants of `TInternalMessage`.
