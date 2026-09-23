# Proposal

## Why

The demo application currently resolves workspace packages through their published `dist` entry points, so a fresh checkout cannot start or type-check the demo until the packages have been built. Development should instead exercise the current package source directly and provide immediate feedback while those sources change.

## What Changes

- Configure the demo application to resolve `@tschannel/core`, `@tschannel/pubsub-channel`, and `@tschannel/iframe-channel` to their workspace source entry points.
- Apply equivalent source mappings to the demo's TypeScript configuration so editor and command-line type resolution matches Vite runtime resolution.
- Verify that the demo can start and type-check when package `dist` directories are absent.
- Preserve package manifests and their published `dist` entry points for package consumers and release builds.

## Capabilities

### New Capabilities

- `developer-experience/demo-app-source-resolution`: Defines how the demo application resolves local workspace packages during development without requiring prebuilt package artifacts.

### Modified Capabilities

None.

## Impact

- Affected configuration: `apps/dev-app/vite.config.ts` and `apps/dev-app/tsconfig.json`.
- Affected workflow: local demo startup and demo type-checking from a fresh checkout.
- Verification may add or adjust repository-level checks for source-based resolution.
- Public package names, exports, runtime APIs, and release artifacts remain unchanged.
