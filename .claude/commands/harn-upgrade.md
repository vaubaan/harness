---
id: harn-upgrade
trigger: /harn-upgrade
description: Moves the project to a newer version of the harness (`/harn-upgrade [version]`), with the migration notes of every version crossed.
args:
  - name: version
    type: string
    required: false
---

# /harn-upgrade

When the human or the agent invokes `/harn-upgrade [version]`, load
the skill `harn-upgrade` with the optional `version` argument: the
target version, the latest when omitted.

The skill pins the package wherever the project pins it, previews
`update`, resolves the conflicts it lists without deleting anything,
applies it, then applies the migration notes of every version between
the one that rendered the project and the target, and ends with the
lint. It reports what changed and what is left; it does not commit.
