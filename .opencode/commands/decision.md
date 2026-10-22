---
description: Writes an ADR under `docs/decisions/<slug>.md` (detects implicit decisions in the diff).
---

# /decision

When the human or the agent invokes `/decision`, load the skill
`decision-record-writer`.

The skill inspects the current diff and recent history looking for
implicit decisions (technology changes, module removals, structural
renames), proposes an ADR, then instantiates `decision.md.tmpl`
under `docs/decisions/<slug>.md` once the decision is validated by
the human.

No arguments — the skill drives the wizard.
