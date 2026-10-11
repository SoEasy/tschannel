## Purpose

The build capability reports the size of published JavaScript artifacts so maintainers can inspect raw and gzip output while building packages.

## ADDED Requirements

### Requirement: Report published JavaScript size after a successful build

When a published package's JavaScript build completes successfully, the build output SHALL report both the byte size of its generated `dist/index.js` and the byte size obtained by gzip-compressing that same file content. The report SHALL identify the package and artifact and SHALL label each size and its unit.

#### Scenario: Build one package

- **WHEN** a maintainer successfully builds `@tschannel/core`
- **THEN** the console output contains a size report for `@tschannel/core`'s `dist/index.js` with raw and gzip sizes

#### Scenario: Build all packages

- **WHEN** a maintainer runs a root build that executes the JavaScript builds of all three published packages
- **THEN** the console output contains a size report for each of `@tschannel/core`, `@tschannel/pubsub-channel`, and `@tschannel/iframe-channel`

### Requirement: Keep the reported metric scoped to the JavaScript artifact

The raw and gzip measurements SHALL use only the generated `dist/index.js` bytes. Source maps, type declarations, and other published files SHALL NOT contribute to either measurement, and reporting SHALL NOT create a compressed distribution artifact.

#### Scenario: Package includes declarations and a source map

- **WHEN** a successful package build produces `dist/index.js`, `dist/index.js.map`, and `dist/index.d.ts`
- **THEN** the reported sizes reflect `dist/index.js` alone and the build does not add a `.gz` file to `dist/`

### Requirement: Do not report an unsuccessful JavaScript build as complete

A failed package JavaScript build SHALL NOT print a successful size report for that package.

#### Scenario: JavaScript build fails

- **WHEN** the package's JavaScript build fails before writing a valid `dist/index.js`
- **THEN** no successful size report for that build is printed
