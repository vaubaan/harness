---
id: harn-workflow
trigger: /harn-workflow
description: Updates `docs/workflow/coding-workflow.md` (CI, env variants, PR, branches, release).
---

# /harn-workflow

When the human or the agent invokes `/harn-workflow`, load the skill
`harn-workflow-writer`.

The skill reads `.github/workflows/`, `vercel.json`, the `package.json`
scripts, the branch/PR config, and proposes an update of the
required sections (CI / env / PR / branches / release) of
`docs/workflow/coding-workflow.md`. For an initial creation, it
instantiates `coding-workflow.md.tmpl`.

No arguments — the skill drives the wizard.
