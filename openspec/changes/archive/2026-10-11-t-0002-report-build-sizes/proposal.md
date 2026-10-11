## Why

Package builds currently finish without showing the size of the JavaScript that consumers receive. Maintainers need a quick, repeatable raw and gzip size report in the build console to notice changes in the three published packages.

## What Changes

- Report the raw byte size and gzip-compressed byte size of each published package's generated `dist/index.js` after its Rollup build succeeds.
- Identify the package and artifact in a readable console line with consistent units and labels.
- Make the report appear when building a package directly or through the root `pnpm build` command.

## Capabilities

### New Capabilities

- `build`: Observable build output for published package artifacts, including raw and gzip JavaScript sizes.

### Modified Capabilities

None.

## Impact

- Affects the shared Rollup build configuration used by `@tschannel/core`, `@tschannel/pubsub-channel`, and `@tschannel/iframe-channel`.
- Does not change emitted package files, package manifests, public APIs, runtime behavior, or the dev application's Vite build.
- The reported gzip size describes the compressed JavaScript artifact, not the npm tarball or total `dist/` contents; source maps and declarations are excluded.
- Uses Node's built-in compression support, so no dependency, compatibility, migration, or package release change is expected. The implementation tasks will confirm the Changesets decision.
