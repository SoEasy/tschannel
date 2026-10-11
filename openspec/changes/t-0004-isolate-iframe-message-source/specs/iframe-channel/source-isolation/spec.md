## Purpose

Ensure that each iframe transport accepts protocol traffic only from its configured peer window, allowing independent iframe pairs to reuse namespaces safely.

## ADDED Requirements

### Requirement: Inbound frames belong to the configured peer window

An iframe channel SHALL deliver an inbound frame only when the browser identifies its source as the channel's configured peer window. A main-side channel's peer SHALL be its configured iframe window, and a worker-side channel's peer SHALL be its parent window. A frame from any other window or without a matching source SHALL be ignored even when its origin is otherwise accepted.

#### Scenario: Main receives a frame from its configured iframe

- **WHEN** a main-side iframe channel receives a frame whose source is its configured iframe window and whose origin passes the configured origin policy
- **THEN** it deserializes and delivers the frame to its registered receiver

#### Scenario: Main observes a same-origin sibling iframe

- **WHEN** a main-side iframe channel observes a frame from a different iframe window with an accepted origin
- **THEN** it ignores the frame without deserializing or delivering it

#### Scenario: Worker observes a non-parent window

- **WHEN** a worker-side iframe channel observes a frame whose source is not its parent window
- **THEN** it ignores the frame without deserializing or delivering it

#### Scenario: Frame source is absent

- **WHEN** an iframe channel receives a frame without a browser source matching its configured peer
- **THEN** it ignores the frame

### Requirement: Same-namespace iframe pairs remain independent

Each main-to-iframe channel pair SHALL expose only its own peer's protocol frames to the core bridge, so simultaneous iframe pairs MAY use the same namespace without cross-selecting worker endpoints.

#### Scenario: Two iframe workers announce the same namespace

- **WHEN** two main bridges are connected to different iframe workers using the same namespace
- **AND** both workers announce themselves through the core handshake
- **THEN** each main bridge selects the worker in its own configured iframe
- **AND** both bridge pairs complete readiness independently

#### Scenario: One sibling announces first

- **WHEN** one iframe worker sends `HELLO` before a same-namespace sibling worker has initialized
- **THEN** only the main bridge configured for the announcing iframe observes that `HELLO`
- **AND** the sibling main bridge remains available to select its own worker later
