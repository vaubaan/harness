---
id: drift
trigger: /drift
invokes_skill: drift-detector
description: "Detects code ↔ doc drift (stale handbooks, orphan ADRs, stale tracks)."
---

# /drift

When the human or the agent invokes `/drift`, load the skill
`drift-detector`.

The skill compares the files declared in the `tracks:` frontmatter of
handbooks / test plans / workflow against their git history, flags
drifts beyond the configured threshold, and lists recently modified
code files with no doc counterpart.

No arguments — the skill produces a standalone report.
