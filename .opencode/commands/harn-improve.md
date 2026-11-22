---
description: Turns the patches reviews keep asking for into rules, proposed with their evidence and written in the project's pillars once accepted.
---

# /harn-improve

When the human or the agent invokes `/harn-improve`, load the skill
`harn-self-improve`.

The skill fetches the recent pull requests if it can, runs
`vaubaan-harness lessons collect`, groups the patch events, and proposes
one rule per recurring patch with its evidence and the pillar it would go
to. The human accepts, edits or rejects each one; accepted rules are
written in the project's docs, rejected ones are kept so they do not come
back. Nothing is committed.

No arguments.
