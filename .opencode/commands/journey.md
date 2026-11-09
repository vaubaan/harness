---
description: Writes or updates `docs/journeys/<name>.md`, one node at a time, in wizard mode.
---

# /journey

When the human or the agent invokes `/journey [name]`, load the skill
`journey-writer` with the optional `name` argument.

If `name` is provided, the skill targets `docs/journeys/<name>.md`
(creation or update). Without an argument, it reads the generated index
`docs/journeys/README.md`, lists the journeys and asks which one to
extend or whether to create one.

The skill instantiates the `journey.md.tmpl` template for creations. For
a new behavior to build, prefer `/story <intent>`.
