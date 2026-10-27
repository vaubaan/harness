---
title: The harness writes only files it owns and never merges
status: accepted
date: 2026-10-14
author: Vaubaan core
---

# The harness writes only files it owns and never merges

## Context

`init` once wrote every rendered file unconditionally, replacing
hand-written `AGENTS.md` or engine settings, and later merged shared
configuration files entry by entry: ownership records in the manifest,
reversal on `uninstall`, a new case with each engine release. Deciding
what a shared file should look like is judgment; the CLI only does what
is mechanical and says what is left.

## Decision

`init` and `update` share one planner, and `uninstall` follows the same
rule. The harness touches a file only when it is absent or recorded in the
manifest with an unchanged fingerprint; any other file is left byte for
byte. Conflicts stop the
command before the first write, all listed at once; the user moves the
content or keeps the file with `--preserve`. Changes apply in one
transaction with a private backup.

## Consequences

- No feature may need to edit a file the project also edits (engine
  settings, MCP configuration): such a feature is out of scope
  ([spec §1.1](../spec/coding-agent-harness.md)).
- `uninstall` removes only unchanged generated files.
- Paths are validated as a batch before any mutation
  ([spec §12](../spec/coding-agent-harness.md)).

## Rejected alternatives

### Merge shared configuration entry by entry
What 1.4 did: safe for JSON keys, but it keeps ownership records, cleanup
and tests for every file shape. All or nothing; nothing was chosen.

### A `--force` flag
Reintroduces the silent data loss; `--preserve` and moving the content
cover the legitimate cases.

### Refuse to run when a manifest or a shared file exists
Re-running `init` is how engines change, and a project with its own
settings is the routine case.
