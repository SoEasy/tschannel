# @tschannel/pubsub-channel

In-memory `EventTarget` transport for tschannel.

```typescript
const eventBus = new EventTarget();
const main = new Bridge(namespace, new PubSubChannel({ side: 'main', eventBus }));
const worker = new Bridge(namespace, new PubSubChannel({ side: 'worker', eventBus }));

await Promise.all([main.ready(), worker.ready()]);
```

An event bus may be shared by multiple endpoints. The core handshake selects one worker and filters
application traffic by endpoint and session. A custom serializer must preserve both control and
application `TInternalMessage` envelopes.
