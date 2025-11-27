# Architecture Decision Records (ADR)

This directory contains **Architecture Decision Records** for the tschannel project.

## What is an ADR?

An Architecture Decision Record (ADR) documents an important architectural decision made in the project, including:
- **Context**: The problem or situation that requires a decision
- **Decision**: What was decided
- **Alternatives**: Other options that were considered
- **Rationale**: Why this decision was made
- **Consequences**: Positive and negative outcomes

## When to Create an ADR

Create an ADR when making decisions about:

- ✅ **Architecture**: Monorepo vs polyrepo, module boundaries, design patterns
- ✅ **Technology Stack**: Framework choice, build tools, testing libraries
- ✅ **API Design**: Breaking changes, major interface redesigns
- ✅ **Process Changes**: CI/CD workflows, versioning strategy, release process
- ✅ **Performance**: Optimization strategies with trade-offs
- ✅ **Security**: Authentication methods, data handling policies

Do NOT create an ADR for:

- ❌ Minor bug fixes
- ❌ Code refactoring without behavioral changes
- ❌ Documentation updates
- ❌ Dependency version bumps (unless it's a major upgrade with significant implications)

## How to Create an ADR

Use the `/adr` slash command in Claude Code:

```
/adr
```

Claude Code will guide you through creating an ADR interactively.

Alternatively, manually copy `TEMPLATE.md` and fill it out.

## File Naming Convention

```
NN-YYYY-MM-DD-descriptive-name.md
```

Where `NN` is a two-digit sequential number (00, 01, 02, ..., 10, 11, ...)

**Examples:**
- `00-2025-11-17-monorepo-migration.md`
- `01-2025-12-01-channel-api-redesign.md`
- `02-2026-01-15-typescript-5-upgrade.md`

**Numbering:**
- ADRs are numbered sequentially starting from 00
- Use two digits with leading zero for numbers < 10 (00, 01, 02, ... 09, 10)
- Number is assigned when ADR is created, not when it's accepted

## ADR Lifecycle

1. **Proposed**: Initial draft, under discussion
2. **Accepted**: Decision has been made and is active
3. **Deprecated**: Still in use but being phased out
4. **Superseded**: Replaced by another ADR (e.g., "Superseded by [ADR-05](05-2025-12-15-new-decision.md)")

## ADR Numbering

- ADRs are numbered sequentially: 00, 01, 02, 03, etc.
- Numbers use two digits with leading zero: 00-09, then 10, 11, 12...
- The `/adr` command automatically assigns the next available number
- Number is part of both the filename and the document title
- Once assigned, numbers are never reused (even if an ADR is deleted)

## Structure

See `TEMPLATE.md` for the recommended ADR structure.

## Maintenance

- **Update Status**: Mark ADRs as "Superseded" when replaced
- **Link Related ADRs**: Cross-reference related decisions
- **Keep Concise**: Focus on the decision, not implementation details
- **Date Everything**: Always include the date of the decision

## References

- [ADR Process Documentation](https://github.com/joelparkerhenderson/architecture-decision-record)
- [Why Write ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
