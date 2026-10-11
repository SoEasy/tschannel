# @tschannel/iframe-channel

`postMessage` transport for communication between a parent (`main`) and iframe (`worker`).

```typescript
const channel = new IframeChannel({
  side: 'main',
  iframe,
  targetOrigin: 'https://child.example',
  expectedOrigin: 'https://child.example',
});
const bridge = new Bridge(namespace, channel);

await bridge.ready();
```

The iframe may finish loading after main is constructed: each endpoint announces itself after local
initialization, and the core handshake handles either startup order without main polling. Continue to
set `targetOrigin` and `expectedOrigin`; handshake frames use the same origin validation as application
traffic.

`ready()` establishes a session but does not detect a later iframe reload or automatically reconnect.
A custom serializer must preserve both control and application `TInternalMessage` envelopes.
