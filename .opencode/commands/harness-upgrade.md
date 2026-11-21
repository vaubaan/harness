---
description: Moves the project to a newer version of the harness (`/harness-upgrade [version]`), with the migration notes of every version crossed.
---

# /harness-upgrade

When the human or the agent invokes `/harness-upgrade [version]`, load
the skill `harness-upgrade` with the optional `version` argument: the
target version, the latest when omitted.

The skill pins the package wherever the project pins it, previews
`update`, resolves the conflicts it lists without deleting anything,
applies it, then applies the migration notes of every version between
the one that rendered the project and the target, and ends with the
lint. It reports what changed and what is left; it does not commit.
