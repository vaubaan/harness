# Release the 1.0.1 safety patch

- **Date:** 2026-09-20
- **Author:** Vaubaan core
- **Status:** accepted

## Context

The cross-check of 1.0.0 reproduced three defects in deletion,
OpenCode configuration and persona preservation. The user explicitly
requested their fix and a new production release of the patch.
PR #51 (historical repository)
applies the [safe lifecycle](./safe-project-artifact-lifecycle.md) decision.

## Decision

Squash-merge PR #51 after its CI passes, then publish
`@vaubaan/harness@1.0.1` via the `v1.0.1` tag on the validated `main`.
The go decision rests on a technical review with no blocking defect, the
320 local tests passing, the extracted tarball test, and evidence of
persona preservation with the OpenCode 1.14.50 API.

## Consequences

The tag triggers the GitHub Packages publish workflow, which also
checks the available version and the `latest` dist-tag. v4 manifests
remain readable; the new v5 manifests distinguish managed files from
shared OpenCode entries. An earlier version must not be used to
uninstall a v5 render. The recovery procedure and its limits are
described in the [workflow](../workflow/coding-workflow.md)
and the [handbook](../handbook/uninstall.md).

## Rejected alternatives

- Keep 1.0.0 as the current version: retains the reproduced defects.
- Republish as 1.0.0 or move its tag: destroys the traceability of a
  version already distributed. A new patch preserves that identity.
