# ADR Index

This directory is the home of tschannel architecture decisions. Each significant decision is recorded in a separate `NNNN-slug.md` file based on [TEMPLATE.md](TEMPLATE.md). **This index is the source of truth for the ADR inventory**; the OpenSpec `adr` specification defines the process contract but does not duplicate the inventory.

## When to Create an ADR

Create an ADR for one decision that materially affects system structure, package boundaries, public interfaces, quality attributes, significant dependencies or construction techniques, or that is costly to reverse. Do not create ADRs for local implementation details or easily reversible maintenance choices.

## Numbering

- Filename: `NNNN-slug.md`, where `NNNN` is a four-digit, zero-padded number and `slug` is kebab-case.
- The next number is the highest existing number in this directory plus one.
- Run `node scripts/next-number.mjs adr` to obtain the next number.
- Numbers are never reused, including after an ADR is rejected, superseded, or deprecated.

## Process

1. Run `node scripts/next-number.mjs adr` and create the numbered file from [TEMPLATE.md](TEMPLATE.md).
2. Keep the ADR focused on one decision. Record the context, decision drivers, serious alternatives, outcome, consequences, and a concrete confirmation method.
3. Set the initial status to `proposed` and add a linked row to this index.
4. When the ADR is tied to an OpenSpec change, keep detailed design exploration in the change's `design.md` and link the two records instead of duplicating content.
5. An agent may draft a proposed ADR but must not mark it `accepted` or `rejected` without explicit user or maintainer confirmation.
6. Treat accepted and rejected ADRs as immutable historical records. If the decision changes, create a new ADR and link both records.
7. Update this index whenever an ADR is created or its status changes.

Decision content must be provided or explicitly confirmed by the user; an agent must not invent it.

## Statuses

- `proposed`: ready for review but not yet approved.
- `accepted`: explicitly approved and currently in force.
- `rejected`: considered and explicitly declined; the rationale remains part of the history.
- `superseded`: replaced by a specific newer ADR; both ADRs link to each other.
- `deprecated`: no longer applicable and has no direct replacement.

## Records

| Number | Title | Status | Date |
| ------ | ----- | ------ | ---- |

The Title cell links to the corresponding ADR file.
