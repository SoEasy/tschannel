# Store Directory

## Purpose

Archive of **reference materials and documentation** that should be preserved for the project.

**Note:** Architecture Decision Records (ADRs) are now in `.claude/adr/` directory.

## What to Put Here

### 1. Reference Guides

General templates, standards, and guidelines not tied to current tasks.

**Examples:**
- `conventional-commits.md` - Commit message standards
- `testing-strategy.md` - Testing approach and patterns
- `api-design-principles.md` - API design guidelines
- `security-checklist.md` - Security review checklist

**When to create:**
- Reusable knowledge
- Coding standards
- Process documentation
- Best practices

**What to include:**
- Clear explanations
- Examples and anti-patterns
- Links to authoritative sources
- Updated regularly

### 2. Research Results

Investigation findings that influenced project decisions.

**Examples:**
- `2025-11-20-iframe-security-research.md` - Security analysis
- `2025-12-05-performance-benchmarks.md` - Performance testing results
- `2026-01-10-browser-compatibility-matrix.md` - Browser support findings

**When to create:**
- After technical spikes
- Performance investigations
- Security audits
- Technology evaluations

**What to include:**
- Research questions
- Methodology
- Findings and data
- Recommendations
- Links to raw data or tools

### 3. Meeting Notes

Important technical discussions and their outcomes.

**Examples:**
- `2025-11-22-api-design-meeting.md` - API design discussion
- `2025-12-15-roadmap-planning.md` - Roadmap planning session

**When to create:**
- After significant design discussions
- Planning meetings
- Technical reviews

**What to include:**
- Participants and date
- Discussion topics
- Decisions made
- Action items
- Follow-up tasks

## File Naming Convention

### For Reference Guides

```
descriptive-name.md
```

**Examples:**
- `conventional-commits.md`
- `testing-strategy.md`
- `api-design-principles.md`

### For Research and Notes

```
YYYY-MM-DD-topic-name.md
```

**Examples:**
- `2025-11-20-iframe-security-research.md`
- `2025-12-05-performance-benchmarks.md`

## What NOT to Put Here

- ❌ **Architecture Decision Records** → Use `.claude/adr/` instead
- ❌ **TODO lists** → Use `.claude/TODO.md` or `.claude/todo/`
- ❌ **Session-specific notes** → Use `.claude/todo/`
- ❌ **Code implementation details** → Belongs in code comments
- ❌ **Temporary files** → Use `.claude/todo/` for temporary work

## Relationship to ADRs

**ADRs** (Architecture Decision Records) are now stored in **`.claude/adr/`** directory.

- **store/** = Reference materials, research, meeting notes
- **adr/** = Architectural decisions with rationale

Use `/adr` command to create new ADRs.

## How Claude Code Uses This Directory

- **Low Priority for Daily Work**: Files here are not loaded by default
- **Referenced When Needed**: Explicitly read when context requires
- **Preserved Knowledge**: Documents reference materials for future use

## Maintenance

- **Keep Organized**: Follow naming conventions
- **Update Regularly**: Review and update outdated content
- **Remove Obsolete**: Archive or delete content that's no longer relevant
- **Cross-Reference**: Link related documents
- **Yearly Review**: Audit content annually for relevance
