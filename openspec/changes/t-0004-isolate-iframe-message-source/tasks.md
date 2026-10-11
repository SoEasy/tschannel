## 1. Source-Isolation Regression Coverage

- [ ] 1.1 Extend the iframe-channel test harness with distinct parent and child window identities whose `MessageEvent.source` values can be controlled explicitly.
- [ ] 1.2 Add focused tests proving matching-source frames are deserialized and delivered while same-origin sibling, non-parent, and missing-source frames are ignored before deserialization.
- [ ] 1.3 Add a two-pair handshake regression in which both mains start before same-namespace iframe workers, one worker announces first, and both pairs ultimately become ready only with their configured peers.

## 2. Iframe Transport Isolation

- [ ] 2.1 Filter inbound iframe messages by identity with the channel's existing target window before origin validation, deserialization, or receiver delivery.
- [ ] 2.2 Preserve current target/expected-origin behavior for matching peers and update the iframe package documentation to describe the combined source-and-origin boundary.
- [ ] 2.3 Add a patch Changeset for `@tschannel/iframe-channel` and confirm that no public configuration, core handshake behavior, dependency, or formatter-policy change is included.

## 3. Verification

- [ ] 3.1 Run iframe-channel lint, typecheck, tests, and build; resolve all failures without committing generated `dist/` or `build/` artifacts.
- [ ] 3.2 Run the relevant core handshake tests to confirm source isolation requires no core protocol change.
- [ ] 3.3 Run strict OpenSpec validation and repository-wide lint, typecheck, format, tests, and build; inspect the final diff for unrelated changes.
