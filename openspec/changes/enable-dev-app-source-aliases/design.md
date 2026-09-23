# Design

## Context

See `proposal.md` for motivation. The demo imports three workspace packages by their public package names. Those package manifests expose only `dist/index.js` and `dist/index.d.ts`, while the demo's Vite and TypeScript configurations currently provide no workspace-source overrides. Consequently both tools follow the package manifests and fail in a checkout where `dist` is absent.

Vite and TypeScript perform independent module resolution, so fixing only one configuration would leave either runtime bundling or static analysis broken.

## Goals / Non-Goals

**Goals:**

- Make the demo runtime and TypeScript resolve the same three package names to their corresponding `src/index.ts` files.
- Keep package-style imports in demo code so the demo still illustrates the consumer-facing API surface.
- Keep source resolution local to `apps/dev-app`.

**Non-Goals:**

- Changing package manifests, exports, or release output.
- Introducing a repository-wide alias convention for applications that do not yet exist.
- Changing demo behavior or redesigning its interface.
- Adding a new alias-management dependency.

## Decisions

### Define explicit aliases in Vite

Add exact aliases for `@tschannel/core`, `@tschannel/pubsub-channel`, and `@tschannel/iframe-channel` in the demo's Vite `resolve.alias` configuration. Each alias points to the respective workspace `src/index.ts` using an absolute path derived from the config file directory.

Explicit aliases keep the override visible at the application boundary and avoid changing the packages' consumer-facing manifests. Aliasing the entry files rather than package directories also avoids depending on source-level package metadata.

Alternatives considered:

- Build packages before starting Vite: rejected because it preserves the startup dependency and weakens source feedback.
- Change package `exports` to expose source: rejected because it would affect consumers and publishing semantics.
- Import packages through relative paths in application code: rejected because it stops exercising public package names and spreads workspace layout knowledge through the demo.

### Mirror aliases with TypeScript paths

Add `baseUrl` and exact `paths` mappings to the demo's `tsconfig.json`, targeting the same three `src/index.ts` files. The Vite aliases remain the runtime source of truth and the TypeScript mappings deliberately mirror them because neither tool consumes the other's configuration natively.

An alias-sharing plugin or generated configuration is unnecessary for three stable workspace packages and would add a dependency and indirection disproportionate to this change.

### Verify against an artifact-free workspace

Validation will run the demo type-check and start its Vite development server while package `dist` directories are absent. This reproduces the original failure and proves both resolution paths independently. The validation must not generate package distribution artifacts as a prerequisite.

## Risks / Trade-offs

- [Risk] Vite and TypeScript alias lists can drift because they are duplicated. -> Mitigation: keep both lists adjacent in the demo configuration scope and verify all three package imports with type-check and startup checks.
- [Risk] Adding another local package dependency later requires another mapping. -> Mitigation: treat the explicit list as part of the demo integration contract and update both configurations when imports are added.
- [Trade-off] The demo tests package source rather than the exact built package bundle. -> This is intentional for local development; package build and release verification continue to cover distribution artifacts separately.
- [Risk] Absolute paths outside the app directory could be rejected by a narrowly scoped Vite filesystem policy. -> Mitigation: resolve within the pnpm workspace root and confirm startup through Vite rather than relying only on static configuration inspection.

## Migration Plan

1. Add matching source aliases to Vite and TypeScript demo configuration.
2. Verify type resolution without generated declarations.
3. Start the demo without package distributions and exercise both configured routes.

Rollback consists of removing the demo-local aliases; package manifests and release behavior require no migration.
