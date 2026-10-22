---
id: doc-audit
trigger: /doc-audit
description: Audits the completeness and freshness of the project docs (selectable scope).
args:
  - name: scope
    type: enum
    values:
      - spec
      - decisions
      - handbook
      - tests
      - workflow
      - readme
      - all
    default: all
---

# /doc-audit

When the human or the agent invokes `/doc-audit [scope]`, load the skill
`doc-audit` with the `scope` passed as argument (default `all`).

The skill reads `docs/` and `README.md`, applies the §9.3 criteria, and emits
a Markdown report in `.vaubaan/reports/doc-audit.md` (creates the folder if missing).
If `scope` is restricted (e.g. `decisions`), only that pillar is audited;
the report does not mention the others.

No additional logic here — the command is a simple
`slash → skill + args` binding.
