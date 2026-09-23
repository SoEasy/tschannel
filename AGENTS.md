# Agent Instructions

1. Read [`.ai/README.md`](./.ai/README.md) and the project context files it marks as required.
2. Before significant work, inspect active OpenSpec changes with `openspec list --json` and durable specifications with `openspec list --specs --json`.
3. If the task belongs to an active change, read that change's proposal, specs, design, and tasks before editing code.
4. Use OpenSpec as the source of truth for non-trivial feature, behavior, architecture, and cross-package work:
   - explore the problem before committing to a solution;
   - create or update a proposal and its artifacts before implementation;
   - implement from `tasks.md` and mark tasks complete only after verification;
   - archive the change after implementation and validation are complete.
5. Do not create parallel TODO files or implementation plans outside OpenSpec for work covered by a change.
6. Small documentation fixes, typo fixes, and narrowly scoped maintenance may be performed without an OpenSpec change when they do not alter observable behavior or architecture.
