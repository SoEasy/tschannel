# Spec Delta

## Purpose

Ensure the repository's demo application runs against current workspace package sources without requiring generated package artifacts during local development.

## ADDED Requirements

### Requirement: Demo resolves workspace packages from source
The demo application SHALL resolve each local `@tschannel/*` dependency used by the demo to that package's source entry point during development.

#### Scenario: Start demo without package build artifacts
- **WHEN** a developer starts the demo application from a workspace in which the local package `dist` directories do not exist
- **THEN** the development server starts without module-entry resolution errors for the demo's local `@tschannel/*` dependencies

#### Scenario: Reflect current package source
- **WHEN** a developer changes an exported implementation in a local package source used by the demo
- **THEN** the demo development environment consumes that source change without requiring the package to be rebuilt into `dist`

### Requirement: Type resolution matches runtime resolution
The demo application's TypeScript configuration SHALL resolve local `@tschannel/*` imports to the same package source entry points used by the development runtime.

#### Scenario: Type-check demo without package declarations
- **WHEN** a developer type-checks the demo application and generated package declaration files are absent
- **THEN** TypeScript resolves the local package imports from source and completes without missing-module errors for those imports

### Requirement: Published package resolution remains unchanged
Source-based demo resolution MUST remain scoped to the demo development configuration and MUST NOT replace the package entry points used by external consumers.

#### Scenario: Inspect package consumer entry points
- **WHEN** a package is built or consumed through its package manifest
- **THEN** its public entry points continue to reference the package's generated distribution artifacts
