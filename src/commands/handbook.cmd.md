---
id: handbook
trigger: /handbook
invokes_skill: handbook-writer
args:
  - name: name
    type: string
description: Writes `docs/handbook/<name>.md` — only what the code does not say (entry points, invariants, traps, settings outside the repo, procedures).
---

# /handbook

When the human or the agent invokes `/handbook [name]`, load the skill
`handbook-writer` with the optional `name` argument.

If `name` is provided, the skill targets `docs/handbook/<name>.md`. Without
an argument, it offers the existing handbooks or creates a new one
after identifying the code area to document.

The skill reads the code, keeps only what an agent would not get from it
quickly, proposes a short draft (`tracks:` frontmatter included via
`handbook.md.tmpl`), and lets the human validate before writing.
