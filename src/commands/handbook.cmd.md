---
id: handbook
trigger: /handbook
invokes_skill: handbook-writer
args:
  - name: name
    type: string
description: Documents the actual implementation of a feature under `docs/handbook/<name>.md`.
---

# /handbook

When the human or the agent invokes `/handbook [name]`, load the skill
`handbook-writer` with the optional `name` argument.

If `name` is provided, the skill targets `docs/handbook/<name>.md`. Without
an argument, it offers the existing handbooks or creates a new one
after identifying the code area to document.

The skill reads the code, proposes a draft (`tracks:` frontmatter included
via `handbook.md.tmpl`), and lets the human validate before writing.
