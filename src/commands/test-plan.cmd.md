---
id: test-plan
trigger: /test-plan
invokes_skill: test-plan-writer
args:
  - name: kind
    type: enum
    values: [integration, e2e]
    default: integration
description: Updates `docs/tests/integration-tests.md` or `e2e-tests.md` depending on `kind`.
---

# /test-plan

When the human or the agent invokes `/test-plan [kind]`, load the skill
`test-plan-writer` with the `kind` passed as argument (default `integration`).

The skill targets `docs/tests/integration-tests.md` or
`docs/tests/e2e-tests.md` depending on `kind`. It walks the existing test
code to detect unlisted scenarios and proposes updates,
relying on the `integration-tests.md.tmpl` or
`e2e-tests.md.tmpl` templates for creations.
