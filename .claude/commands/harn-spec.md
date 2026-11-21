---
id: harn-spec
trigger: /harn-spec
description: Writes or updates a `docs/spec/<name>.md` file in wizard mode.
args:
  - name: name
    type: string
---

# /harn-spec

When the human or the agent invokes `/harn-spec [name]`, load the skill
`harn-spec-writer` with the optional `name` argument.

If `name` is provided, the skill directly targets `docs/spec/<name>.md`
(creation or update). Without an argument, it lists the existing
specs and asks you to pick one / create one.

The skill instantiates the `spec.md.tmpl` template for creations.
