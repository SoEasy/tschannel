## 1. Package build reporting

- [x] 1.1 Add a shared Rollup post-write size reporter that reads each package's emitted `dist/index.js`, computes raw and in-memory gzip byte counts, and prints the package name, artifact, labeled values, and units without emitting new files.
- [x] 1.2 Confirm the reporter runs only for successful JavaScript outputs and does not alter package exports, bundling, source maps, or declarations.

## 2. Verification and release decision

- [x] 2.1 Run an uncached direct build of a published package and an uncached root build; verify that all three package reports appear and the private dev application's build does not receive this report.
- [x] 2.2 Independently compare the reported raw and gzip values with the emitted `dist/index.js` bytes, and verify that `.map` and `.d.ts` files do not contribute and no `.gz` artifact is created.
- [x] 2.3 Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`, and `openspec validate t-0002-report-build-sizes --strict`; address any failures caused by the change.
- [x] 2.4 Decide and record whether a Changesets entry is required. If the implementation only adds build-console reporting with no published package behavior or artifact change, omit the entry and state that rationale in the implementation summary.
