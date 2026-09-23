# change-numbering

## Purpose

Define the sequential naming convention for OpenSpec changes and the contract for the tool that generates the next number. The convention keeps `openspec/changes/` lexicographically ordered by creation sequence while producing names accepted by OpenSpec commands.

## Requirements

### Requirement: Sequential change naming

Each active change directory in `openspec/changes/` SHALL be named `t-NNNN-<slug>`, where `t-` is the required lowercase task prefix, `NNNN` is a four-digit, zero-padded sequence number, and `<slug>` is a concise kebab-case name. The leading letter keeps the name compatible with OpenSpec's requirement that change names start with a lowercase letter. The number SHALL represent creation order and keep the directory tree lexicographically ordered.

#### Scenario: Assign the next number to a new change

- **WHEN** a new OpenSpec change is created
- **THEN** its directory is named `t-NNNN-<slug>`
- **AND** `NNNN` is one greater than the highest numbered active or archived change

#### Scenario: Use the name with OpenSpec commands

- **WHEN** a change name is passed to `openspec status --change` or `openspec instructions --change`
- **THEN** the command accepts the lowercase name beginning with `t-`

#### Scenario: Sort changes chronologically

- **WHEN** a developer views `openspec/changes/` in lexicographic order
- **THEN** numbered active changes appear in creation order

### Requirement: Next-number CLI

The project SHALL provide `scripts/next-number.mjs`. With no argument, the script SHALL scan directory names in `openspec/changes/` and `openspec/changes/archive/`, then print the next prefix as `t-NNNN`. It SHALL include archived changes so numbers are not reused after archival. The script SHALL NOT create or rename directories.

#### Scenario: Generate a change prefix

- **WHEN** `node scripts/next-number.mjs` is run
- **THEN** stdout contains `t-` followed by the highest number found in active and archived changes plus one, zero-padded to four digits

#### Scenario: Generate the first change prefix

- **WHEN** no active or archived directory contains a `t-NNNN-` change identifier
- **THEN** the script prints `t-0001`

#### Scenario: Include archived changes

- **WHEN** the highest numbered change has been moved to `openspec/changes/archive/`
- **THEN** the script uses its number when calculating the next prefix

### Requirement: Supported numbering modes

The script SHALL support change numbering with no argument and ADR numbering with the `adr` argument. Any other argument or additional argument SHALL be rejected with a non-zero exit code and a usage message on stderr.

#### Scenario: Select ADR numbering

- **WHEN** the script is run as `node scripts/next-number.mjs adr`
- **THEN** it prints the next ADR number as defined by the `adr` specification

#### Scenario: Reject an unsupported mode

- **WHEN** the script receives an argument other than `adr`
- **THEN** it exits with a non-zero status
- **AND** stderr contains usage guidance
