---
title: Every path is validated before the harness mutates a project
status: accepted
date: 2026-09-20
author: Vaubaan core
---

# Every path is validated before the harness mutates a project

## Context

The cross-check of 1.0.0 showed that paths read from the manifest could
designate files outside the project: a tampered or hand-edited manifest
could make `uninstall` delete an external target, or make `init` write
through a symbolic link.

## Decision

`init`, `update` and `uninstall` validate every path involved before
any mutation: relative, contained in the target directory, inside the
managed locations, with no `..` traversal, no absolute path and no
symbolic component under the target root. The root itself may be
canonicalized when it is a link. An invalid entry aborts the operation
before the first file is touched, including when it appears after
valid entries.

## Consequences

- A tampered manifest can no longer delete or write an external target.
- The harness refuses symbolic paths in its mutations even when the
  link seems to point to a legitimate target; converting a link-based
  setup is an explicit, separate step.
- These validations protect the inspected state; they are not a lock
  against another process modifying the paths concurrently.

## Rejected alternatives

### Clean paths as deletions proceed

An invalid entry at the end of the list would leave the first
deletions already done. Full validation precedes mutation.

### Accept links that resolve inside the project

The check would depend on the filesystem state at the moment of the
operation; refusing links keeps the rule simple and testable.

## History

- 2026-09-20: decided (1.0.1), together with entry-level ownership of
  OpenCode MCP entries and the preservation of the session's persona
  when the OpenCode hook re-injected a lint report.
- 2026-10-22, 8a92564 and c45b319: the MCP ownership and the hook
  continuation removed with the features they served
  ([no-mcp-no-code-merge](./no-mcp-no-code-merge.md),
  [lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md)); the
  path validation stands.
