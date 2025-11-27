# Library Registry

This file documents **key libraries** used in the tschannel project. It serves as a rationale and decision log for technology choices.

## 📋 Rules & Guidelines

### What is a "Key Library"?

A library is considered "key" if it meets ONE or more of these criteria:

1. **Architectural Impact** - Affects project structure or workflow
   - Examples: Turborepo (monorepo orchestration), pnpm (package manager), Changesets (versioning)

2. **Build & Tooling** - Core build pipeline tools
   - Examples: Rollup (bundler), TypeScript (compiler), API Extractor (types)

3. **Code Quality** - Essential development tools
   - Examples: ESLint (linter), Prettier (formatter), Vitest (testing)

4. **Deliberate Choice** - Chosen over alternatives with specific rationale
   - Examples: Vitest vs Jest, Rollup vs Webpack, Changesets vs semantic-release

### What NOT to Include

- ❌ **Transitive dependencies** - Dependencies of dependencies
- ❌ **Utility libraries** - Generic utilities (lodash, ramda) unless architectural
- ❌ **Standard type definitions** - @types/\* packages (unless special consideration)
- ❌ **Plugins without rationale** - Standard ESLint/Rollup plugins without unique purpose

### When to Update This File

- ✅ **Installing** a new key library
- ✅ **Removing** a key library
- ✅ **Replacing** one library with another
- ✅ **Upgrading** to a new major version with breaking changes
- ⚠️ **NOT** for minor/patch version updates (use package.json for that)

---

## 🤖 Instructions for Claude Code

### When Installing a New Library

**ALWAYS** follow these steps after running `pnpm add <library>`:

1. **Determine if library is "key"** using criteria above
2. **If YES**, add entry to this file:
   - Place in appropriate category (or create new if needed)
   - Include: name, description, purpose, rationale
   - Follow the Entry Template below
3. **If NO**, skip adding to this file (it will be in package.json only)

### When Removing a Library

**ALWAYS** follow these steps after running `pnpm remove <library>`:

1. **Check if library is in this file**
2. **If YES**, remove the entire entry for that library
3. **If NO**, nothing to do in this file

### When Replacing a Library

**ALWAYS** follow these steps when replacing library A with library B:

1. **Remove entry for old library A**
2. **Add entry for new library B**
3. **In rationale for B**, mention: "Replaces [A] because [reason]"

Example:

```
- vitest: [...] Replaces Jest because of faster execution and better ESM support.
```

### Validation

After any change to dependencies:

- Verify all libraries in this file exist in root or package-level `package.json`
- Verify structure matches the Entry Template
- Verify entries are in appropriate categories

---

## 📦 Entry Template

When adding a new library, use this format:

```markdown
## [Category Name]

- **library-name**: Short description (1 line). Purpose in project. Rationale for choosing this library over alternatives (if applicable).
```

**Example:**

```markdown
## Testing

- **vitest**: Fast test runner with native ESM support. Used for unit and integration tests across all packages. Chosen over Jest for better ESM support and faster execution in monorepo environment.
```

---

## Build and Types

- **typescript**: TypeScript compiler. Used for type checking, generating `.d.ts` files in `build/types/`, and as input for bundling. Provides static typing for entire codebase.

- **rollup**: Module bundler. Builds ESM bundle (ES5 target) in `dist/index.js` with sourcemap. Chosen for excellent tree-shaking and ESM support, producing smaller bundles than Webpack.

- **rollup-plugin-typescript2**: TypeScript integration with Rollup. Handles downleveling to ES5 and generates correct sourcemaps. Provides better TypeScript support than @rollup/plugin-typescript.

- **@rollup/plugin-node-resolve**: Resolves ESM imports from `node_modules` and relative paths for the bundle. Essential for bundling dependencies.

- **@rollup/plugin-commonjs**: Converts CommonJS dependencies (if any) to ESM for Rollup. Ensures compatibility with older libraries.

- **@rollup/plugin-json**: Allows importing JSON files in source code. Useful for configuration and metadata.

## Public API and Type Extraction

- **@microsoft/api-extractor**: Assembles a single public `.d.ts` file (`dist/index.d.ts`) from `tsc` output declarations. Controls the composition of the public API and ensures clean type exports. Industry standard for library type generation.

## Testing

- **vitest**: Test runner with native ESM support. Used for fast unit tests across all packages without DOM dependencies. Chosen over Jest for better ESM support, faster execution, and seamless Vite integration.

- **@vitest/coverage-v8**: Code coverage plugin based on V8 for Vitest. Provides fast, accurate coverage reports for test suites.

## Code Style and Formatting

- **eslint**: Linter for JavaScript/TypeScript code. Enforces code quality rules and catches common errors. Industry standard for JS/TS projects.

- **@typescript-eslint/parser**: ESLint parser for TypeScript source files. Enables ESLint to understand TypeScript syntax.

- **@typescript-eslint/eslint-plugin**: Set of ESLint rules specifically for TypeScript. Catches TypeScript-specific issues and enforces best practices.

- **eslint-config-prettier**: Disables ESLint rules that conflict with Prettier. Ensures both tools work together without conflicts.

- **prettier**: Opinionated code formatter. Ensures unified code style across the project automatically. Reduces style discussions and enforces consistency.

## Git Hooks and Commit Style

- **husky**: Git hooks manager. Runs scripts on git events (pre-commit, commit-msg, etc.). Ensures code quality checks run before commits.

- **lint-staged**: Runs linters/formatters only on staged files in pre-commit hook. Improves performance by avoiding full project scans on every commit.

- **@commitlint/cli**: Validates commit messages for compliance with Conventional Commits. Ensures consistent commit history for automated changelog generation.

- **@commitlint/config-conventional**: Conventional Commits ruleset for commitlint. Provides standard rules for commit message validation.

## Monorepo Management

- **turbo** (Turborepo): Monorepo build orchestration tool. Provides build result caching, parallel task execution, and incremental builds. Chosen as modern standard for monorepo projects with excellent performance and developer experience.

- **@changesets/cli**: Version and changelog management for monorepo. Allows independent package versioning, generates changelogs based on change descriptions. Chosen over semantic-release because it's specifically designed for monorepos with independent versioning strategy.

- **pnpm**: Fast package manager with efficient disk space management. Used for workspaces (monorepo). Chosen for strict dependency isolation, fast installation, and excellent monorepo support. Advantages over npm/yarn: 3x faster installs, ~50% less disk space, better security through strict isolation.

## License Checking

- **license-checker-rseidelsohn**: Analyzes the dependency tree and their licenses. Used in CI pipeline to ensure all dependencies comply with project license policy (MIT, Apache-2.0, BSD, ISC). Prevents accidental inclusion of incompatible licenses.

---

## 📝 Maintenance Notes

- **Last reviewed**: 2025-11-18
- **Total key libraries**: 18
- **Monorepo packages**: 3 (@tschannel/core, @tschannel/iframe-channel, @tschannel/pubsub-channel)

When this file grows large, consider:

- Moving deprecated/replaced libraries to `store/deprecated-libs.md`
- Creating category-specific files (e.g., `LIBS-BUILD.md`, `LIBS-TEST.md`)
