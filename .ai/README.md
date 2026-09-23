# Instructions for AI agents

## 🔥 MANDATORY EXECUTION

When starting in this project:

### 1. Read REQUIRED files from the `.ai/` directory:

- **`PROJECT.md`** - Technical documentation: project goals, architecture, APIs, build process

### 2. Read RECOMMENDED files (if they exist):

- **`LIBS.md`** - list of used libraries with rationale
- **`CODESTYLE.md`** - code style rules and naming conventions
- **`LANG_PREF.local.md`** - personal language preferences for communication (if exists)

### 3. Study the project context based on the information read

### 4. Check OpenSpec state before significant work

- Run `openspec list --json` to inspect active changes
- Run `openspec list --specs --json` to inspect durable project capabilities
- If the task belongs to an active change, read its proposal, specs, design, and tasks before editing code

## 📋 Working Rules

### Language Requirements

**Personal language preferences** (for communication):

- See `LANG_PREF.local.md` file for your personal language settings
- If file doesn't exist, copy from `LANG_PREF.local.md.example` and configure
- This setting only affects explanations and discussions with you

**Project-wide language standards** (universal for all contributors):

- **All code**: English only
- **Documentation in repository**: English only
- **Comments in code**: English only
- **Commit messages**: English (Conventional Commits format)
- **Variable names, functions, classes**: English only
- **Files in `.ai/` directory**: English (for universal compatibility)
- **API endpoints, schemas, types**: English only

**Why English for code?**

- Universal accessibility for international contributors
- Better tooling support (linters, IDEs, AI assistants)
- Industry standard for open-source projects
- Easier code reviews and collaboration

### Working with Libraries

**IMPORTANT:** `LIBS.md` contains detailed rules and instructions. Read it first!

**Quick rules:**

- When installing ANY library: Determine if it's "key" (see LIBS.md criteria)
- **If key library**: Update `LIBS.md` with entry (name, description, purpose, rationale)
- **If utility/minor library**: Only update `package.json` (via pnpm)
- When removing a library: Remove from `LIBS.md` if it was there
- When replacing a library: Update `LIBS.md` to reflect the change

**Full instructions and examples:** See `LIBS.md` file

### Version Management with Changesets

- Add a changeset for user-visible changes to a published package
- A changeset is normally not required for documentation, tests, repository tooling, or dev-app-only changes
- When uncertain whether a release is required, make the decision explicit in the OpenSpec tasks or final verification
- Create changesets with `pnpm changeset`
- Select affected package(s)
- Choose change type (patch/minor/major)
- Describe what was done
- Commit the generated `.changeset/*.md` file with your changes
- **DO NOT** manually edit package.json versions - Changesets handles this

### Working with OpenSpec

OpenSpec is the source of truth for significant planned work. Do not maintain a parallel `TODO.md`, `todo/*.md`, or another implementation plan for work already covered by an OpenSpec change.

Use the following lifecycle:

1. **Explore** - investigate the codebase, clarify requirements, and compare approaches without implementing
2. **Propose** - create a change with a proposal, delta specs, design decisions when needed, and executable tasks
3. **Apply** - implement from the change's `tasks.md`; mark a task complete only after its implementation and verification are complete
4. **Archive** - validate and archive the completed change so accepted delta specs become durable project specifications

An OpenSpec change is expected for:

- New or changed user-visible behavior
- Public API changes
- Architecture or cross-package changes
- Work with multiple implementation steps or meaningful design decisions

An OpenSpec change is normally unnecessary for:

- Typo and formatting fixes
- Documentation corrections that do not change product requirements
- Narrow maintenance with no observable behavior or architecture impact

Before implementation, inspect the relevant change with `openspec status --change <name> --json`. Before archiving, ensure every task is complete and the required checks pass.

### Code Review Requirements

Before submitting changes, run all programmatic checks:

```bash
# Lint check
pnpm lint

# Type check
pnpm typecheck

# Format check
pnpm format:check

# Run tests
pnpm test

# Build verification
pnpm build
```

All checks must pass before code can be merged.

Additionally:

- Ensure code follows `CODESTYLE.md` conventions
- Create meaningful commit messages (Conventional Commits format)
- Add changeset for package changes (`pnpm changeset`)

## 📁 Directory Structure

### Required Files

**PROJECT.md** - Technical project documentation (committed to git)

- Project goals and purpose
- Architecture and monorepo structure
- Build requirements and tooling
- Package APIs and design principles
- **Note**: Contains ONLY technical information, NO workflow instructions

## 🎯 Goal

Ensure efficient work with the project, maintaining up-to-date documentation and executing assigned tasks with consideration of the project context.
