---
title: Project skills
tracks:
  - src/loader.ts
  - src/render.ts
  - src/cli/plan-render.ts
last_reviewed: 2026-10-27
---

# Project skills — handbook

Domain skills a project versions in `docs/skills/*.skill.md`, rendered alongside the built-in ones. Spec: [§9.1.2](../spec/coding-agent-harness.md#912-optional-pillars).

## Start here

- [`src/loader.ts`](../../src/loader.ts) — `loadProjectSkills`, called by `planInit` for `init`, `update` and `lint:generated-fresh`.
- [`src/render.ts`](../../src/render.ts) — where project skills are merged into the stock, before the overrides.

## Invariants

- Same frontmatter schema as built-in skills, same strict validation: one invalid project skill fails `init`, `update` and `lint:generated-fresh`.
- A project skill with the `id` of a stock skill replaces it; `disable.yaml` can still disable it.
- No command is generated for a project skill: the agent invokes it by name.

## Traps

- The rendered copies are generated files: after adding or editing a project skill, run `npx @vaubaan/harness update .` and commit, or `lint:generated-fresh` fails.
- The `docs/skills/` line of the `AGENTS.md` project map appears only when at least one project skill exists; it also changes `AGENTS.md`, so it is part of the same update.
- Only `docs/skills/*.skill.md` at the top level is read: no subfolders, no other extension.
