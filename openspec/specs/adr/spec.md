# adr

## Purpose

Define the project contract for recording architecture decisions: which decisions need Architecture Decision Records (ADRs), where ADRs live, how they are structured and reviewed, how their lifecycle is managed, and how the index is maintained. `.ai/adr/INDEX.md` is the source of truth for the ADR inventory; this specification defines only the process contract. The rationale for each decision lives in its ADR file.

## Requirements

### Requirement: Architecturally significant scope

The project SHALL create an ADR for a decision that materially affects system structure, package boundaries, public interfaces, quality attributes, significant dependencies or construction techniques, or that is costly to reverse. An ADR SHALL record exactly one decision. Local implementation details and easily reversible maintenance choices SHALL NOT require an ADR.

#### Scenario: Record a significant decision

- **WHEN** a decision changes a public contract or introduces a difficult-to-reverse architectural constraint
- **THEN** the decision is recorded in an ADR

#### Scenario: Skip a local implementation choice

- **WHEN** a choice is local, inexpensive to reverse, and does not affect an architectural constraint
- **THEN** the choice may be implemented without an ADR

#### Scenario: Split independent decisions

- **WHEN** a proposal contains multiple decisions that could be accepted or superseded independently
- **THEN** each decision is recorded in a separate ADR

### Requirement: ADR file location and naming

The project SHALL store ADRs as Markdown files in `.ai/adr/`. Each ADR SHALL be named `NNNN-slug.md`, where `NNNN` is a four-digit, zero-padded sequence number and `slug` is a concise kebab-case description. Sequence numbers SHALL increase monotonically and SHALL NOT be reused.

#### Scenario: Create a new ADR

- **WHEN** an architecture decision is ready to be proposed
- **THEN** a file named `NNNN-slug.md` is created in `.ai/adr/`
- **AND** `NNNN` is one greater than the highest existing ADR number

#### Scenario: Preserve a retired ADR number

- **WHEN** an ADR becomes rejected, superseded, or deprecated
- **THEN** its file remains in `.ai/adr/`
- **AND** its sequence number is not reused

### Requirement: ADR structure

Each ADR SHALL follow `.ai/adr/TEMPLATE.md`. It SHALL include status and date metadata, links to related work and supersession relationships, and the sections **Context and Problem Statement**, **Decision Drivers**, **Considered Options**, **Decision Outcome**, **Consequences**, **Confirmation**, and **More Information**.

#### Scenario: Create a complete ADR draft

- **WHEN** an ADR file is created
- **THEN** it contains every required metadata field and section from the template
- **AND** unresolved metadata uses an explicit placeholder such as `none` or `pending`

#### Scenario: State a decision outcome

- **WHEN** an ADR proposes or records a decision
- **THEN** Decision Outcome states one choice in active voice
- **AND** explains why it best satisfies the listed decision drivers

#### Scenario: Document trade-offs

- **WHEN** alternatives are evaluated
- **THEN** Considered Options includes the current approach when relevant
- **AND** Consequences records positive, negative, and neutral effects without hiding known costs or risks

### Requirement: ADR status and approval

ADR status SHALL be one of `proposed`, `accepted`, `rejected`, `superseded`, or `deprecated`. New ADRs SHALL start as `proposed`. An agent MAY draft a proposed ADR but SHALL NOT mark it `accepted` or `rejected` without explicit user or maintainer confirmation.

#### Scenario: Accept a proposed decision

- **WHEN** the user or maintainer explicitly approves a proposed ADR
- **THEN** its status is changed to `accepted`
- **AND** the index is updated in the same change

#### Scenario: Reject a proposed decision

- **WHEN** the user or maintainer explicitly rejects a proposed ADR
- **THEN** its status is changed to `rejected`
- **AND** the rationale remains available for future reference

### Requirement: ADR immutability and succession

Accepted and rejected ADR content SHALL be treated as immutable. Corrections that change rationale or outcome SHALL be recorded in a new ADR. Administrative metadata and supersession links MAY be updated without rewriting the historical decision.

#### Scenario: Supersede an accepted decision

- **WHEN** a new accepted ADR replaces an existing decision
- **THEN** the old ADR status is changed to `superseded`
- **AND** the old and new ADRs link to each other
- **AND** the old decision content is not rewritten

#### Scenario: Deprecate a decision without a replacement

- **WHEN** an accepted decision no longer applies and no ADR replaces it
- **THEN** its status is changed to `deprecated`
- **AND** the reason is recorded without removing the original decision

### Requirement: Decision confirmation

Each ADR SHALL describe how implementation or continued compliance can be confirmed. Confirmation MAY use automated tests, build or dependency checks, code review criteria, or a documented manual inspection.

#### Scenario: Define a verifiable decision

- **WHEN** an ADR is proposed
- **THEN** Confirmation identifies at least one concrete way to detect whether the system follows the decision

### Requirement: ADR index

The project SHALL maintain the ADR inventory in `.ai/adr/INDEX.md`. The `adr` specification SHALL NOT duplicate that inventory. Creating an ADR or changing an ADR status SHALL update the index in the same change.

#### Scenario: Index reflects an ADR

- **WHEN** an ADR is created or its status changes
- **THEN** `.ai/adr/INDEX.md` contains its number, a linked title, status, and date

#### Scenario: Consult the ADR inventory

- **WHEN** a developer needs the complete list of ADRs
- **THEN** the list is read from `.ai/adr/INDEX.md`, not from the `adr` specification

### Requirement: OpenSpec relationship

An ADR SHALL record a durable architecture decision without duplicating the detailed design of an OpenSpec change. When a decision is coupled to an OpenSpec change, the change's `design.md` SHALL contain the working design and trade-off exploration, and the ADR SHALL link to the change. A change governed by an existing ADR SHALL link to that ADR instead of creating a duplicate record.

#### Scenario: Record a decision made during an OpenSpec change

- **WHEN** an OpenSpec change produces a durable architecture decision
- **THEN** the change retains detailed design information in `design.md`
- **AND** the ADR records the decision and links to the change

#### Scenario: Apply an existing decision

- **WHEN** an OpenSpec change implements or follows an existing ADR without changing it
- **THEN** the change links to the existing ADR
- **AND** no duplicate ADR is created

### Requirement: Agent-independent ADR creation workflow

The project SHALL provide an agent-independent workflow for creating ADRs. The author SHALL obtain the next number with `node scripts/next-number.mjs adr`, create the ADR from `.ai/adr/TEMPLATE.md`, set its status to `proposed`, and update `.ai/adr/INDEX.md` in the same change. The author SHALL use user-provided or explicitly confirmed decision content and SHALL NOT invent a decision on the user's behalf.

#### Scenario: Create an ADR through the standard workflow

- **WHEN** a user asks to record an architecture decision and provides or confirms its content
- **THEN** the author runs `node scripts/next-number.mjs adr` to obtain `NNNN`
- **AND** creates `.ai/adr/NNNN-slug.md` from the template with status `proposed`
- **AND** adds a linked entry to `.ai/adr/INDEX.md`

#### Scenario: Generate the first ADR number

- **WHEN** `.ai/adr/` contains no file matching `NNNN-slug.md`
- **THEN** `node scripts/next-number.mjs adr` prints `0001`

#### Scenario: Generate a subsequent ADR number

- **WHEN** existing ADR filenames contain one or more sequence numbers
- **THEN** `node scripts/next-number.mjs adr` prints the highest existing number plus one, zero-padded to four digits
