# Local TODO Files

This directory contains **personal/session-specific TODO files** that are **NOT committed to git**.

## Purpose

- Store detailed task breakdowns for individual work sessions
- Track progress on specific features or bugs
- Keep personal notes and planning separate from global project tasks

## File Naming Convention

**Format:** `task-name.md` (without date prefix)

**Examples:**

- `eslint-configuration.md`
- `authentication-feature.md`
- `refactor-bridge-core.md`
- `message-direction-refactoring.md`

## Lifecycle

1. **Creation:** When starting work on a global task, Claude Code creates a detailed plan here
2. **Usage:** Reference and update throughout the work session
3. **Completion:** Delete manually when work is finished (or archive if needed)

## TODO Styles

Choose the style that best fits the task:

### 1. Checklist Style
**Best for:**
- Simple, straightforward tasks
- Quick feature additions
- Bug fixes with clear steps

**Example:**
```markdown
## Goals
- [ ] Goal 1
- [ ] Goal 2
- ✅ Completed goal
```

### 2. Detailed Style
**Best for:**
- Complex refactoring
- Architectural changes
- Tasks requiring code examples

**Example:**
```markdown
### 1. Update Component
**Current:**
\`\`\`typescript
const old = 'code';
\`\`\`

**New:**
\`\`\`typescript
const new = 'code';
\`\`\`

✅ **Completed - mark entire section with emoji when done**
```

## Marking Completed Tasks

Use ✅ emoji to mark completed items:
- In checklists: `- ✅ Task name` or `- [x] Task name`
- In detailed plans: Add ✅ at the start of sections or steps

## Relationship to Global TODO

- **Global TODO** (`.claude/TODO.md`) - High-level project tasks (in git)
- **Local TODO** (this directory) - Detailed plans for each task (gitignored)

One global task → One local detailed plan file

## Template

See `TEMPLATE.md` in this directory for both style examples.

---

**Note:** All `*.md` files in this directory are gitignored. Only `.gitkeep`, `README.md`, and `TEMPLATE.md` are committed.
