---
title: Quality pillar
tracks:
  - src/linters/quality-schema.ts
  - src/templates/code-quality.md.tmpl
  - src/renderers/common.ts
  - src/cli/plan-render.ts
last_reviewed: 2026-10-27
---

# Quality pillar — handbook

The optional `docs/quality/code-quality.md`, the project's own code rules, read directly by agents. Spec: [§9.1.2](../spec/coding-agent-harness.md#912-optional-pillars).

## Start here

- [`src/linters/quality-schema.ts`](../../src/linters/quality-schema.ts) — the shape check.
- [`src/templates/code-quality.md.tmpl`](../../src/templates/code-quality.md.tmpl) — the template a project copies by hand; there is no writer skill.

## Invariants

- The pillar is optional because `docs/quality` is absent from the required directories (`doc-layout`, `check`); `quality-schema` reports nothing until the directory exists.
- The file has no `tracks:` and is not scanned by `frontmatter-tracks` or `tracks-drift`: it sets a norm, it does not follow the code.

## Traps

- The `AGENTS.md` line depends on the **file**, not the directory: an empty `docs/quality/` adds nothing. The line is computed at render time, so creating the file requires `update .` and a commit, after which `lint:generated-fresh` enforces it.
- The section headings must be exact level-2 lines (`## Project rules`, nothing after it); the French names are still accepted, accents optional.
- Overlap with ADRs, handbooks or tool configs is not detected mechanically: only `doc-audit` judges it.
