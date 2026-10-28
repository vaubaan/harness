---
id: test-plan
trigger: /test-plan
description: Updates `docs/tests/integration-tests.md` or `e2e-tests.md` (scope, stack, conventions, known gaps) depending on `kind`.
args:
  - name: kind
    type: enum
    values:
      - integration
      - e2e
    default: integration
---

# /test-plan

When the human or the agent invokes `/test-plan [kind]`, load the skill
`test-plan-writer` with the `kind` passed as argument (default `integration`).

The skill targets `docs/tests/integration-tests.md` or
`docs/tests/e2e-tests.md` depending on `kind`. It checks the documented stack and
conventions against the test code, lists the specs without tests as known
gaps (never the covered scenarios), and proposes updates, relying on the `integration-tests.md.tmpl` or
`e2e-tests.md.tmpl` templates for creations.
