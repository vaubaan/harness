---
title: Preserve the project during the harness lifecycle
status: accepted
date: 2026-09-20
author: Vaubaan core
---

# Preserve the project during the harness lifecycle

## Context

The cross-check of 1.0.0 confirmed the Codex layouts, but revealed
three lifecycle problems. Paths read from the manifest could designate
files outside the project. The shared file `.opencode/opencode.json`
was replaced and then deleted as if it were an entirely generated
artifact. Finally, the OpenCode hook restarted a session without
specifying its agent, which could replace the current persona with the
default agent.

The 1.0.1 fix keeps the layouts of
[engine-native-layouts-1-0](./engine-native-layouts-1-0.md) and protects
the files and the session already present in the consumer.

## Decision

The `init` and `uninstall` operations validate every path involved
before any deletion: relative paths contained in the target directory
and belonging to the managed locations, with no `..` traversal, no
absolute path, and no symbolic component under the target root. The
target root itself may be canonicalized when it is a link.
An invalid entry
aborts the operation before the first file is deleted, including when
that entry appears after a valid entry.

The OpenCode configuration becomes a shared document. The harness
adds only the missing MCP entries and keeps the other settings. An
entry with the same name that is already present stays unchanged; a
difference from the requested configuration produces a warning. The
v5 manifest records the added entries and their installed value so
that only the untouched ones are removed. It does not take ownership
of a pre-existing entry, even an identical one. If the user later
modifies an added entry, their version is preserved on removal.
Old v4 manifests, which lack this
ownership information, are handled conservatively: no shared
configuration is deleted merely because it appears in their file list.
An invalid configuration is reported before any mutation, without
being silently replaced.

The OpenCode hook retrieves the current agent from the session
messages and passes it explicitly when re-injecting the lint report.
If it cannot find that agent, it does not trigger an implicit
continuation with the `build` agent.

## Consequences

**Positive:**

- A tampered manifest can no longer delete an external target.
- OpenCode settings and the user's later modifications survive
  reinstallation and removal of the harness.
- A lint continuation keeps the persona that was already working.

**Constraints:**

- The manifest now carries ownership metadata for shared entries; v4
  manifest compatibility is explicit.
- The harness refuses symbolic paths involved in its mutations, even
  when a link seems to point to a legitimate target.
- An old or modified state whose ownership cannot be demonstrated may
  leave a configuration to inspect rather than delete it.
- These validations protect the inspected state; they are not a lock
  against another process modifying the paths concurrently.

## Rejected alternatives

### Clean paths as deletions proceed

An invalid entry at the end of the list would leave the first
deletions already done. Full validation therefore precedes mutations.

### Treat any OpenCode file as owned by the harness

The file also contains project-specific agents, permissions and
servers. Its presence in an old manifest is not enough to attribute
each of these values to the harness.

### Systematically replace the configuration with a backup

A global restore would overwrite changes made after installation.
Pre-existing values are never replaced; removal covers only the added
entries whose value still matches the installed one.

### Re-inject without an agent when resolution fails

Implicitly choosing `build` changes the contract of a `review` or
`planning` session. A continuation without a known identity is
therefore avoided.

## References

- [Harness contract](../spec/coding-agent-harness.md)
- [File lifecycle](../handbook/uninstall.md)
- [Integration test plan](../tests/integration-tests.md)
