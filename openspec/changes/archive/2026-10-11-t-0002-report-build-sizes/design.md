## Context

See `proposal.md` for the motivation and `specs/build/spec.md` for the observable contract. Each published package uses `configs/rollup.config.shared.js` to write one ESM `dist/index.js` plus a source map. API Extractor writes `dist/index.d.ts` earlier in each package's build script. The root build runs package builds through Turbo and also builds the private Vite dev application.

## Goals / Non-Goals

**Goals:**

- Measure the exact JavaScript bytes written by a successful package build and display raw and gzip sizes beside an unambiguous package name.
- Keep reporting in the shared package build path, so direct and root builds use the same behavior.

**Non-Goals:**

- Change bundling, minification, external dependency handling, or emitted files.
- Estimate a consumer application's bundle size or the size of an npm publication archive.
- Add a size budget or fail builds based on size.

## Decisions

### Measure the written artifact in the shared Rollup configuration

Add one small Rollup plugin to the shared configuration and report from its post-write lifecycle hook. Read the generated `dist/index.js` from the output path, calculate its byte length, gzip the same bytes in memory with Node's built-in `zlib`, and print one line. Derive the displayed package name from that package's `package.json`. A post-write measurement reflects the exact artifact, including any transformations Rollup performs before writing it, and naturally runs only after a successful JavaScript output.

Alternative: add a post-build script to each package or the root `build` command. That repeats integration across three packages, and a root-only script would miss direct package builds. Another alternative is a third-party size plugin; built-in Node APIs cover this single-file metric without a new dependency.

### Report only `dist/index.js` with explicit labels

Print a stable, readable line such as `@tschannel/core dist/index.js: raw 24.3 KiB | gzip 7.1 KiB`. Compute both displayed values from byte counts using the same unit conversion. Do not write a `.gz` file. This keeps the metric about runtime JavaScript and avoids conflating it with declarations, maps, or publication size.

Alternative: sum all `dist/` files or create a compressed package archive. Those answer different questions and would make the console figure misleading as an estimate of JavaScript transfer size.

## Risks / Trade-offs

- [Turbo cache hit skips the Rollup hook] → The report is guaranteed for a JavaScript build that actually executes; cached task output is controlled by Turbo's log replay. Verify uncached direct and root builds during implementation.
- [gzip compression adds build time] → Compress only the single generated JS file in memory; the current artifact set is one JS file per package.
- [Channel bundles may include code from `@tschannel/core`] → Report actual emitted bytes without changing the existing externalization policy. Any investigation or correction of package boundaries is a separate change.

## Migration Plan

No migration is required. The console report is additive, and rollback consists of removing the shared reporting plugin. Package entry points and published artifacts remain unchanged.
