---
id: readme
trigger: /readme
invokes_skill: readme-writer
description: Maintains the root `README.md` (pitch, quick start, links to the pillars).
---

# /readme

When the human or the agent invokes `/readme`, load the skill
`readme-writer`.

The skill reads the root `README.md` (or instantiates `readme.md.tmpl` if it
is missing), syncs the links to `docs/spec/`, `docs/handbook/`,
`docs/workflow/coding-workflow.md`, and checks that pitch + quick start
reflect the current state of the code (entry points, run scripts,
major dependencies).

No arguments — the skill drives the wizard.
