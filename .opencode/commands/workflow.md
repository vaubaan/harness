---
description: Updates `docs/workflow/coding-workflow.md` (CI, env variants, PR, branches, release).
---

# /workflow

When the human or the agent invokes `/workflow`, load the skill
`workflow-writer`.

The skill reads `.github/workflows/`, `vercel.json`, the `package.json`
scripts, the branch/PR config, and proposes an update of the
required sections (CI / env / PR / branches / release) of
`docs/workflow/coding-workflow.md`. For an initial creation, it
instantiates `coding-workflow.md.tmpl`.

No arguments — the skill drives the wizard.
