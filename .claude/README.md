# Instructions for Claude Code

## 🔥 MANDATORY EXECUTION

When starting in this project:

### 1. Read REQUIRED files from the `.claude/` directory:

- **`PROJECT.md`** - Technical documentation: project goals, architecture, APIs, build process
- **`framework.json`** - Framework metadata and file structure

### 2. Read RECOMMENDED files (if they exist):

- **`LIBS.md`** - list of used libraries with rationale
- **`CODESTYLE.md`** - code style rules and naming conventions
- **`PR.md`** - pull request composition rules
- **`TODO.md`** - current tasks to complete
- **`LANG_PREF.local.md`** - personal language preferences for communication (if exists)

### 3. Study the project context based on the information read

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
- **Files in `.claude/` directory**: English (for universal compatibility)
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

- After completing any task that changes package functionality, run `pnpm changeset`
- Select affected package(s)
- Choose change type (patch/minor/major)
- Describe what was done
- Commit the generated `.changeset/*.md` file with your changes
- **DO NOT** manually edit package.json versions - Changesets handles this

### Working with Tasks

**Two-Level TODO System:**

1. **Global Tasks** (`TODO.md`) - Important project-wide tasks (in git)
   - High-level features, bugs, refactorings
   - Visible to all contributors
   - Format: GitHub-style checkboxes (`- [ ]` / `- [x]`)

2. **Local Plans** (`todo/*.md`) - Detailed session plans (gitignored)
   - Personal TODO files for each work session
   - File naming: `task-name.md` (e.g., `eslint-setup.md`)
   - **MANDATORY**: Read `todo/README.md` for style guidelines before creating plans
   - See `todo/TEMPLATE.md` for structure examples

**Workflow:**

1. When starting significant work, ask: "Should this be added to global TODO.md?"
   - If YES: Add high-level task to `TODO.md` + create detailed plan in `todo/`
   - If NO: Only create local plan in `todo/`

2. **Creating local plans:**
   - **MUST** read `todo/README.md` first to understand available styles
   - Choose appropriate style (Checklist or Detailed) based on task complexity
   - Use ✅ emoji to mark completed items
   - See `todo/TEMPLATE.md` for examples

3. During work: Update local plan in `todo/*.md`

4. When complete:
   - Mark global task as done: `- [x]` in `TODO.md`
   - Delete or archive local plan file

**Examples of Global vs Local:**

- ✅ Global: "Implement authentication system", "Fix critical bridge bug"
- ❌ Not Global: "Update .claude/ docs", "Refactor helper function"

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

## 🎯 Slash Commands

Use these commands for quick actions:

- **`/init`** - Load full project context with summary
- **`/review`** - Perform code review of staged changes
- **`/changeset`** - Guide through creating a changeset
- **`/context`** - Show current context structure
- **`/adr`** - Create new Architecture Decision Record

## 📁 Directory Structure

### Required Files

**PROJECT.md** - Technical project documentation (committed to git)
- Project goals and purpose
- Architecture and monorepo structure
- Build requirements and tooling
- Package APIs and design principles
- **Note**: Contains ONLY technical information, NO workflow instructions

**framework.json** - Framework metadata
- File structure definitions
- Feature flags
- TODO strategy configuration

### `adr/` - Architecture Decision Records

Important architectural decisions with context, alternatives, and rationale.

- **Purpose**: Document significant architectural choices
- **Format**: `YYYY-MM-DD-decision-name.md`
- **Command**: Use `/adr` to create new ADRs interactively
- **Status**: In git, committed for team reference

### `store/` - Reference Materials

Reference guides, research results, and meeting notes.

- **Purpose**: Preserve important non-ADR documentation
- **Examples**: Testing strategies, research findings, meeting notes
- **Status**: In git, committed for team reference
- **Not for**: ADRs (use `adr/`), TODOs (use `TODO.md` or `todo/`)

### `todo/` - Local Session Plans

Detailed task breakdowns for personal work sessions (gitignored).

- **Purpose**: Personal TODO files for each session
- **Format**: `task-name.md` (e.g., `refactoring-api.md`)
- **Styles**: Two formats available - Checklist (simple) or Detailed (with code examples)
- **Status**: Gitignored, local only
- **MANDATORY**: Read `todo/README.md` before creating any TODO files
- **Template**: See `todo/TEMPLATE.md` for both style examples

## ⚠️ Important

- Context loads automatically when Claude Code starts
- Always maintain up-to-date files in the `.claude/` directory
- If questions arise - ask clarifying questions

## 🎯 Goal

Ensure efficient work with the project, maintaining up-to-date documentation and executing assigned tasks with consideration of the project context.
