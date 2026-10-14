---
id: clean-code
trigger: /clean-code
invokes_skill: clean-code-guardian
args:
  - name: scope
    type: string
    default: diff
description: Audits code quality (typing, naming, decomposition, testability, architecture) on the current diff or a targeted path.
---

# /clean-code

When the human or the agent invokes `/clean-code [scope]`, load the skill
`clean-code-guardian` with the `scope` passed as argument (default `diff`).

The skill reads the touched code and applies the quality criteria (strict
typing, naming, decomposition, testability, DRY/abstraction balance,
architectural purity). It emits a Markdown report in a file
`.vaubaan/reports/clean-code-report.md` (creates the folder if missing).

If `scope = diff` (default), only the current diff is audited; if a
path is passed, only that subtree is scanned.

No additional logic here — the command is a simple
`slash → skill + args` binding.
