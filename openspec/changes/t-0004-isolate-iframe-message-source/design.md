## Context

See [proposal.md](proposal.md) for the failure mode. Every `IframeChannel` already resolves one `targetWindow`: main uses the configured iframe's `contentWindow`, while worker uses `window.parent`. Sending is scoped to that window, but receiving is attached to the ambient `window` and currently uses only optional origin filtering. The core handshake treats the first compatible worker announcement visible to a main bridge as selectable, so inbound transport visibility must match outbound reachability.

## Goals / Non-Goals

**Goals:**

- Make inbound and outbound iframe routing describe the same peer window.
- Reject unrelated-window frames before custom deserialization or bridge delivery.
- Prove two iframe pairs with the same namespace can initialize in the failure-producing startup order.
- Preserve the current public configuration and package boundaries.

**Non-Goals:**

- Change core handshake selection, retry, or timeout semantics.
- Add authentication, reconnect, iframe reload detection, or origin derivation.
- Treat source identity as a replacement for `targetOrigin` and `expectedOrigin`.

## Decisions

### Match browser source identity against the existing target window

The receive path will require the incoming `MessageEvent` source to equal the channel's existing `targetWindow`. For main this is the configured `iframe.contentWindow`; for worker it is `window.parent`. This reuses the peer identity already required for sends and needs no new public option.

Alternative: track endpoint identifiers from handshake frames inside the iframe driver. Rejected because protocol identity belongs to core and cannot prove which browser window delivered a frame before deserialization.

Alternative: rely on `expectedOrigin`. Rejected because sibling iframes commonly share an origin, and origin equality does not identify a particular browsing context.

### Reject source mismatches before deserialization

Source identity will be checked before invoking the configured serializer and before forwarding data to the registered receiver. Origin validation remains required when configured; a frame must pass both independent checks.

This ordering prevents unrelated windows from exercising custom deserialization and makes an ignored frame have no application-visible serializer or bridge effects.

### Test both transport filtering and handshake convergence

Focused channel tests will cover direct acceptance and rejection using distinct window identities, including accepted-origin sibling traffic. An integration regression will create two main/worker pairs with the same namespace, start both mains before the workers, announce one worker first, and verify that both pairs eventually become ready with their own peers.

The test must model separate window sources rather than using the existing single-window self-posting fixture, because that fixture cannot expose sibling-window cross-talk.

## Risks / Trade-offs

- **[Existing consumers intentionally forward another window's frames]** Those frames will stop reaching the channel. → Treat this as correction of the documented one-iframe peer boundary and record a patch Changeset.
- **[Test environment does not populate `MessageEvent.source` automatically]** A naive fixture could pass without exercising identity. → Construct events or transport doubles with explicit, distinct source objects and assert the serializer is not called on mismatch.
- **[WindowProxy identity across navigation]** Browser identity rules can be subtle when an iframe navigates. → Compare against the configured `contentWindow` reference and keep reload/reconnect semantics out of this change.

## Migration Plan

1. Add failing source-isolation and two-pair handshake regressions.
2. Add source validation to the iframe receive path without changing public configuration.
3. Update iframe package documentation and add a patch Changeset.
4. Run focused iframe/core checks and the repository-wide verification suite.

Rollback reverts the source filter, tests, documentation, and Changeset together; no stored state or API migration is required.
