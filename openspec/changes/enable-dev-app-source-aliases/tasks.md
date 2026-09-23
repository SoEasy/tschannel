# Tasks

## 1. Configure Source Resolution

- [ ] 1.1 Add exact Vite aliases in `apps/dev-app/vite.config.ts` for all three demo `@tschannel/*` dependencies, each targeting its workspace `src/index.ts`, and verify Vite resolves every imported package name without reading a package `dist` entry.
- [ ] 1.2 Add matching `baseUrl` and `paths` mappings in `apps/dev-app/tsconfig.json`, and verify `pnpm --filter dev-app exec tsc --noEmit` completes without missing-module errors while generated package declarations are absent.

## 2. Verify Artifact-Free Demo Development

- [ ] 2.1 Start the demo with `pnpm --filter dev-app dev --host 127.0.0.1` while local package `dist` directories are absent, and verify Vite reports ready without package-entry resolution errors.
- [ ] 2.2 Load both `/` and `/iframe-channel` from the development server and verify the PubSub and iframe demo entry points compile and render without module-resolution failures.
- [ ] 2.3 Review the final diff and verify no `packages/*/package.json` public entry points or generated `dist` artifacts were changed to enable the demo workflow.
