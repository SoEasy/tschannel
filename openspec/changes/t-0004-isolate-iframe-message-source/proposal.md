## Why

Each main-side `IframeChannel` listens to the parent window's shared `message` stream but currently accepts same-origin frames from every child window. With the core handshake, two iframe pairs using the same namespace can both lock onto the first worker `HELLO`, after which one pair addresses `SELECT` to the wrong iframe and times out.

## What Changes

- Scope incoming iframe traffic to the channel's configured peer window as well as its expected origin.
- Preserve the existing origin validation and serializer behavior after source validation succeeds.
- Add a regression with two iframe peers using the same namespace and prove that each main bridge completes the handshake only with its own iframe worker.
- Document source isolation as part of the iframe channel's transport contract.
- Keep core peer-selection semantics, protocol envelopes, heartbeat/reconnect behavior, and cross-origin policy out of scope.

## Capabilities

### New Capabilities

- `iframe-channel/source-isolation`: Defines how an iframe channel associates inbound `MessageEvent` frames with its configured peer window and isolates simultaneous same-namespace iframe pairs.

### Modified Capabilities

None.

## Impact

- `@tschannel/iframe-channel`: inbound `MessageEvent` filtering, integration tests, and package documentation.
- Public API: no new configuration or exported type is planned; existing `iframe`, `targetOrigin`, and `expectedOrigin` options keep their meanings.
- Compatibility: frames from windows other than the configured iframe or parent will be ignored even when their origin matches, closing an unintended acceptance path.
- Dependencies: no new runtime or development dependency is expected.
- Release: the observable transport fix requires an explicit Changesets decision, expected to be a patch release for `@tschannel/iframe-channel`.
