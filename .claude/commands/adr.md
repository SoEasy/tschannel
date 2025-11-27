Create a new Architecture Decision Record (ADR) with guided discussion.

## Workflow Overview

This command follows a two-phase approach:

**Phase 1: Discussion & Exploration** (collaborative)
- User describes the problem in general terms
- Claude asks clarifying questions
- Together explore the problem space, alternatives, and trade-offs
- Refine understanding through dialogue

**Phase 2: Formalization** (structured)
- Ask user confirmation: "Ready to create formal ADR?"
- Gather structured information
- Generate ADR file with discussed content

---

## Phase 1: Discussion & Exploration

### 1. Initial Greeting

"I'll help you create an Architecture Decision Record (ADR). Let's start by discussing the problem together.

ADRs document important architectural decisions with context, alternatives, and rationale. The final record will be saved in `.claude/adr/`.

**First, tell me in your own words:** What problem or decision are you facing?"

### 2. Collaborative Discussion

**Listen and ask follow-up questions** based on user's description. Use these questions as guidance:

**Understanding the problem:**
- "What specifically prompted this decision right now?"
- "What constraints or requirements are you working with?"
- "Who will be affected by this decision?"
- "Are there any non-negotiable requirements?"

**Exploring alternatives:**
- "What options have you already considered?"
- "What are you leaning towards, and why?"
- "What concerns do you have about each option?"
- "Are there any options we haven't discussed yet?"

**Analyzing trade-offs:**
- "What's most important: performance, maintainability, developer experience, or something else?"
- "What are the long-term implications?"
- "What risks do you see?"
- "What would make you change this decision in the future?"

**Continue discussion naturally** until you both have clarity on:
- ✅ The core problem
- ✅ 2-3 viable alternatives
- ✅ Key trade-offs
- ✅ A preferred direction (or acknowledgment that more research is needed)

### 3. Summarize Discussion

Before moving to Phase 2, provide a summary:

"Let me summarize our discussion:

**Problem:** [Brief statement]

**Alternatives we discussed:**
1. [Option A] - [Key pros/cons]
2. [Option B] - [Key pros/cons]
3. [Option C] - [Key pros/cons]

**Emerging preference:** [Which option and why]

**Key concerns:** [What to watch out for]

Does this capture our discussion accurately? Anything to add or clarify?"

Wait for user confirmation or corrections.

---

## Phase 2: Formalization

### 4. Transition to Formal ADR

Ask: "**Ready to create the formal ADR document?** I'll ask you some structured questions to fill in the template."

Wait for user confirmation.

### 5. Gather Structured Information

**Important:** Use insights from Phase 1 discussion. Don't re-ask what was already discussed - propose answers based on the conversation and ask for confirmation.

Ask these questions **only if not already clear** from discussion:

a. **Decision title**:
   - Propose: "Based on our discussion, how about: '[Suggested Title]'?"
   - Or ask: "What should we call this decision? (short noun phrase)"

b. **Deciders**:
   - Ask: "Who is involved in making this decision? (e.g., 'Team', specific names, or just you)"

c. **Status**:
   - Ask: "What's the current status?"
     - "Proposed" - Still under discussion
     - "Accepted" - Decision is final
     - "In Progress" - Being implemented

d. **Final check on alternatives**:
   - Present the alternatives from Phase 1
   - Ask: "Should I include all of these, or focus on specific ones?"

e. **Rationale refinement**:
   - Propose: "Based on our discussion, the main rationale is: [your summary]"
   - Ask: "Anything to add or adjust?"

### 6. Determine ADR Number

**Find the next available ADR number:**

1. List all files in `.claude/adr/` directory
2. Find files matching pattern: `NN-YYYY-MM-DD-*.md` (where NN is a number)
3. Extract the highest number found
4. Next number = highest + 1
5. Format as two digits: `00`, `01`, `02`, ..., `09`, `10`, `11`, etc.

**If no ADR files exist yet:** Start with `00`

**Example logic:**
- Existing: `00-2025-11-17-monorepo.md`, `01-2025-11-18-eslint.md`
- Highest: 01
- Next: 02

### 7. Generate Filename

- Format: `NN-YYYY-MM-DD-decision-name.md`
- NN = two-digit ADR number from step 6
- YYYY-MM-DD = today's date
- decision-name = slugified title (lowercase, hyphens instead of spaces)
- Show user: "Creating ADR-NN: `.claude/adr/NN-YYYY-MM-DD-decision-name.md`"

### 8. Create ADR File

- Location: `.claude/adr/NN-YYYY-MM-DD-decision-name.md`
- Use template from `.claude/adr/TEMPLATE.md`
- Fill in **all sections possible** using discussion content:
  - **Title**: `# ADR-NN: [Decision Title]` (use the NN from step 6)
  - **Date**: Today's date
  - **Status**: From user input (Proposed/Accepted/In Progress)
  - **Deciders**: From user input
  - **Context**: From Phase 1 discussion
  - **Decision**: From Phase 1 discussion
  - **Alternatives**: From Phase 1 discussion (with pros/cons)
  - **Rationale**: From Phase 1 discussion
  - **Consequences**: Fill in **Positive** and **Negative** based on discussion
  - **Risks**: Fill in based on discussion
  - **Implementation Notes**: Add placeholder or discussion notes
  - **Related Decisions**: Leave for user (with ADR-XX format examples)
  - **References**: Leave for user

### 9. Completion

Show user:
- ✅ ADR created: **ADR-NN** - `.claude/adr/NN-YYYY-MM-DD-decision-name.md`
- Sections completed from discussion
- What to review: "Please review and update as needed, especially:"
  - Consequences (verify completeness)
  - Implementation Notes (add technical details)
  - Related Decisions (link to other ADRs using ADR-XX format)
  - References (add external links)
- Remind: "This is **ADR-NN**. When referencing this decision elsewhere, use: `[ADR-NN](NN-YYYY-MM-DD-decision-name.md)`"

---

## Example Interaction

```
User: /adr

Claude: I'll help you create an Architecture Decision Record (ADR). Let's start by discussing the problem together.

ADRs document important architectural decisions with context, alternatives, and rationale. The final record will be saved in `.claude/adr/`.

**First, tell me in your own words:** What problem or decision are you facing?

User: We're struggling with how to version our monorepo packages independently

Claude: That's a common challenge in monorepos. Let me understand better:

1. What specifically prompted this decision right now? Is there a pain point with the current approach?
2. Are all packages released together currently, or do you already have some independent versioning?
3. What constraints are you working with? (CI/CD, semantic versioning requirements, etc.)

[... discussion continues ...]

Claude: Let me summarize our discussion:

**Problem:** Need independent versioning for monorepo packages to avoid unnecessary version bumps

**Alternatives we discussed:**
1. **Changesets** - Developer-driven, flexible, good DX
2. **Lerna** - Automatic, but less control
3. **Manual versioning** - Full control, but error-prone

**Emerging preference:** Changesets because of better developer experience and fine-grained control

**Key concerns:** Learning curve for team, need good documentation

Does this capture our discussion accurately?

User: Yes, perfect!

Claude: **Ready to create the formal ADR document?** I'll ask you some structured questions to fill in the template.

User: Yes

Claude: Based on our discussion, how about calling this: "Independent Package Versioning with Changesets"?

User: Sounds good

Claude: Who is involved in making this decision?

User: The core team

Claude: What's the current status?
- "Proposed" - Still under discussion
- "Accepted" - Decision is final
- "In Progress" - Being implemented

User: Accepted

Claude: [Checks existing ADRs in .claude/adr/]
This will be **ADR-00** (first ADR in the project).

Creating: `.claude/adr/00-2025-11-18-independent-package-versioning.md`

[Creates file with all content from discussion]

✅ ADR created: **ADR-00** - `.claude/adr/00-2025-11-18-independent-package-versioning.md`

Please review and update:
- Consequences (verify completeness)
- Implementation Notes (add technical details)
- Related Decisions (link to other ADRs)
- References (add external links)

This is **ADR-00**. When referencing this decision elsewhere, use: `[ADR-00](00-2025-11-18-independent-package-versioning.md)`
```