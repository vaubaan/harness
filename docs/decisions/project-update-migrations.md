---
title: Updating a project from its existing installation
status: accepted
date: 2026-09-20
author: Vaubaan core
---

# Updating a project from its existing installation

## Context

Re-running `init` with its defaults was not enough to move an
installation to a new version while keeping its choices: the engines,
the preserved files, the overrides folder. Migrating several projects
also requires a preview, and a rollback after a write error.

This decision complements
[safe-project-artifact-lifecycle](./safe-project-artifact-lifecycle.md)
and shares its planner with [safe-init](./safe-init.md).

## Decision

The CLI exposes `update [target-dir]`. It uses the contents of the
package version currently running, with no download or lookup of a
newer version. An existing manifest is required; versions 1 to 5 are
recognized and the result is recorded as v6.

- `--dry-run` produces the plan without any write, including no backup
  folder. `--json` exposes the structured result.
- `--backup-dir` picks an exact new folder for the backup;
  `--overrides-dir` designates the parent of `.harness-overrides/`.
- `--preserve` removes the requested generated paths from generation
  and from the harness's ownership; the choice persists in
  `preservedFiles`.
- `update` keeps the recorded engines. Project skills and local
  overrides take part in rendering.
- Files 1.x wrote or edited outside the rendered set (MCP files,
  engine settings) are released: dropped from the manifest with a
  warning, left in place
  ([no-mcp-no-code-merge](./no-mcp-no-code-merge.md)).
- Planning checks paths and collisions before writing. A destination
  outside the manifest that already contains user content is a
  conflict, never overwritten. Symbolic links under the target are
  rejected.
- Applying first creates a durable, private backup of the data that
  will be touched, then applies the plan. An apply error restores the
  previous contents and modes; the backup is kept.
- The v6 manifest records the package version and the fingerprints of
  generated files. A differing fingerprint raises an error before
  mutation unless the content already matches the new rendering; old
  manifests without fingerprints get their managed files regenerated
  with a warning and a prior backup.

## Consequences

- The same command migrates old installations and applies later
  versions without redefining the project's settings, and the result
  is committed like any generated file.
- Backups may contain sensitive configuration; their directory stays
  private and uncommitted.
- The transaction is not a lock against another process modifying the
  project at the same time; a restoration error is reported with the
  path of the retained backup.
- Updating the npm pin remains a separate action.

## Rejected alternatives

### Only recommend `uninstall` then `init`

Loses settings not passed to the new command, does not handle old
manifests and provides no rollback between the two operations.

### Automatically download the latest version

The result would depend on the network and the registry. The caller
chooses the package version that runs the migration.

### Overwrite, then back up only on error

The original bytes would already be lost. The backup precedes the first
mutation.

### Accept legacy symbolic links

It would weaken the destination validation of 1.0.1. Link-based
installations are converted explicitly before the normal update.

## History

- 2026-09-20: decided (1.1.0), with entry-level merge of hooks and
  MCP entries and a hook-preference field in the manifest.
- 2026-10-22, 8a92564 and c45b319: merge, hook preference and entry
  ownership removed; released paths introduced.

## References

- [Update contract](../spec/coding-agent-harness.md#updating-an-existing-installation)
- [Update implementation](../handbook/project-update.md)
