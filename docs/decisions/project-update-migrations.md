---
title: Updating a project from its existing installation
status: accepted
date: 2026-09-20
author: Vaubaan core
---

# Updating a project from its existing installation

## Context

1.0.1 protects deletions and the OpenCode configuration, but does not
provide a full migration of installations already in place.
The local inventory includes v2 manifests, custom hooks
outside the manifest, project MCPs and an installation that disabled
hooks. Re-running `init` with its default values is not enough to
preserve these choices. Migrating a fleet also requires a preview
and a rollback after a write error.

This decision complements
[safe-project-artifact-lifecycle](./safe-project-artifact-lifecycle.md).
It adds an explicit update path; the layout choices
of [1.0.0](./engine-native-layouts-1-0.md) are unchanged.

## Decision

The CLI exposes `update <target-dir>`. It uses the contents of the
package version currently running, with no download or
lookup of the latest version during the update. An existing manifest
is required. Manifest versions 1 to 5 are recognized
for migration; the new installation is recorded as v6.

The target defaults to `.`. `--json` exposes the structured result,
`--backup-dir` picks an exact new folder for the backup and
`--overrides-dir` designates the parent of the `.harness-overrides` directory.
`--preserve` explicitly removes the requested paths from generation
and from the harness's ownership; these choices persist in
`preservedFiles` in the v6 manifest. This option applies to generated
artifacts; the manifest and shared configurations are excluded from it.

`update` keeps the recorded engines and Stop hooks preference.
When this preference is missing from an old manifest, it is
inferred from the hook artifacts declared in the manifest rather than from the
defaults of a new installation. Project skills and local
overrides take part in rendering; an explicit overrides directory can
be provided. Existing MCP configurations are kept, even
if they were not listed in the manifest.

Native hooks are corrected only for the harness's exact commands
whose provenance is known, without removing other hooks or
settings. A pre-existing entry outside the manifest is not adopted.
The old OpenCode MCP listed in the manifest is migrated to the
native configuration conservatively:
no user entry with the same name is replaced and the provenance
of additions remains tracked. This migration procedure does not
implicitly extend the destructive rules of a plain `init`.

Planning checks paths and collisions before writing.
A destination outside the manifest that already contains user content
is not overwritten as if it were a generated file. Shared configuration
files follow their specific merge rules. Symbolic
links under the target remain rejected; converting an old
link-based setup is a separate, explicit migration.

`--dry-run` produces the plan without any write, including no backup
folder. Applying first creates a durable, private
backup of the data that will be touched, then applies the plan. An
apply error triggers restoration of the previous contents and modes;
the backup is kept for inspection and resumption.

The v6 manifest records the package version and the fingerprints of
generated files in order to detect local modifications during a
subsequent update. A differing fingerprint raises an error
before mutation if the content does not already match the new rendering;
customized content must be carried by an override or placed
explicitly out of ownership with `--preserve`.
Old manifests do not have these fingerprints:
their files declared as managed can be regenerated with a warning
and a prior backup. Detected conflicts are spelled out in
the plan before mutation.

## Consequences

**Positive:**

- The same command is used to migrate old installations and to
  apply subsequent versions without redefining the project's settings.
- The plan makes it possible to inspect changes before they are applied.
- The project's own hooks and MCPs are not treated as generated
  files whose entire content the harness owns.
- v6 provenance improves the detection of local modifications.

**Constraints:**

- Backups consume space and may contain sensitive
  configurations; their directory must stay private and must
  not be committed.
- Old manifests do not allow each local change to be attributed with certainty:
  the warning and the backup make this
  limitation explicit.
- The transaction is not a lock against another process modifying
  the project at the same time; a restoration error is reported with
  the path of the retained backup.
- Updating an npm dependency or a wrapper pin remains an
  action separate from updating the project's artifacts.

## Rejected alternatives

### Only recommend `uninstall` then `init`

This sequence loses settings not passed to the new command,
does not handle old manifests and provides no rollback
between the two operations.

### Automatically download the latest version

The result would depend on the network and on the state of the registry. The caller
explicitly chooses the package version that runs the migration.

### Overwrite, then back up only on error

The original bytes would already be lost. The backup therefore precedes
the first mutation and remains available after the operation.

### Accept legacy symbolic links

This would weaken the destination validation introduced in 1.0.1.
Link-based installations are converted explicitly,
keeping their targets, before the normal update.

## References

- [Update contract](../spec/coding-agent-harness.md#updating-an-existing-installation)
- [Integration plan](../tests/integration-tests.md)
- [File lifecycle](../handbook/uninstall.md)
- [Update implementation](../handbook/project-update.md)
