## Why

`@tschannel/core` currently concentrates transport coordination, message shape checks, handshake state, application requests, middleware, and observation in one large `Bridge` source file. Explicit contracts and smaller ownership boundaries will make those behaviors easier to understand, test, and replace without changing how existing consumers use the package.

## What Changes

- Organize Bridge code under `packages/core/src/bridge/` around internal contracts for message shape validation, protocol sessions, application messaging, and middleware/observation. Keep the existing `Bridge` class as the public coordinating facade.
- Require a short English responsibility comment before imports in every source file in `src/bridge/`.
- Give every new source file in `src/bridge/` a corresponding focused test file, including type checks for contracts and export checks for the directory entry point.
- Preserve current handshake, application messaging, middleware, observation, error, timing, and destruction behavior, including existing consumer imports and generic method inference.
- Infer the public `Bridge.ERRORS` type from one `as const` error catalog, removing duplicated handwritten type declarations. Error values and callable signatures remain the same; constant strings become readonly literal types.

## Capabilities

No runtime capabilities are added or modified. This change reorganizes implementation and refines the `Bridge.ERRORS` type; the existing `core/handshake` and `core/middleware` requirements remain authoritative and unchanged. The change declares `skip_specs: true` because it has no protocol or middleware spec-level behavior change.

## Impact

- Affected package: `@tschannel/core`; source organization, internal imports, tests, and generated declaration output.
- Public API: no new export. The existing `Bridge`, constructor, methods, types, package entry point, and error values remain. `Bridge.ERRORS` now exposes inferred readonly literal strings rather than mutable `string` properties; consumers that reassigned those properties must stop doing so.
- Package manifests and runtime dependencies: no planned changes. Channel packages and the demo application should continue to work against the same core entry point.
- Release: record the requested public `Bridge.ERRORS` type refinement in a Changeset after validating the generated declaration.
- Non-goals: changing wire protocol, middleware semantics, request retry behavior, serializer or channel ownership, transport source isolation, or introducing one OpenSpec capability per source file.
