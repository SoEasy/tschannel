## MODIFIED Requirements

### Requirement: Control-frame isolation

Handshake control frames SHALL pass through the channel serializer and transport but SHALL NOT invoke application transformation hooks, application message handlers, or application pending-request resolution. A registered middleware observer SHALL receive lifecycle notifications about submitted control-frame sends, admitted control-frame receives, and handshake failures; its result or failure SHALL NOT affect protocol negotiation.

Before changing handshake state, a bridge SHALL validate the control-frame discriminator, protocol version representation, namespace, endpoint identity, sender role, addressing, session identifier, and rejection reason required by that frame type. Unknown or malformed control frames SHALL be ignored without settling readiness or creating a session.

#### Scenario: Handshake frame traverses a custom serializer

- **WHEN** a bridge sends a handshake control frame through a channel configured with a custom serializer
- **THEN** the serializer can preserve and restore that frame as part of the core protocol envelope

#### Scenario: Middleware is registered during handshake

- **WHEN** handshake control frames are exchanged while application transformation hooks and an observer are registered
- **THEN** application transformation hooks are not invoked for those control frames
- **AND** the observer can receive their control-frame lifecycle notifications without changing the handshake

#### Scenario: Unknown control frame is received

- **WHEN** a bridge receives a same-namespace control envelope with an unknown `type`
- **THEN** it ignores the envelope without rejecting readiness or notifying the observer of an admitted frame

#### Scenario: Selection omits its session identifier

- **WHEN** a worker receives an addressed `SELECT` without a non-empty session identifier
- **THEN** it ignores the malformed selection
- **AND** it does not become ready or send `CONNECTED`
