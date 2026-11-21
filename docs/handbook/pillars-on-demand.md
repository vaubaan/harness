---
title: Pillars on demand
tracks:
  - src/pillars.ts
  - src/cli/add.ts
  - src/cli/plan-render.ts
  - src/parser/profile.ts
  - src/renderers/profiles-index.ts
  - src/linters/profile-schema.ts
  - src/linters/intent-profiles.ts
  - src/skills/harness-zero.skill.md
  - src/skills/harness-upgrade.skill.md
  - tests/integration/add.test.ts
  - tests/integration/pillars.test.ts
last_reviewed: 2026-11-21
---

# Pillars on demand — handbook

What makes a pillar active, how `add` activates one, and the profiles pillar that came with it. Spec: [§9.1.2](../spec/coding-agent-harness.md#912-active-pillars), [§9.1.4](../spec/coding-agent-harness.md#914-profiles); decisions: [pillars-on-demand](../decisions/pillars-on-demand.md), [profiles-pillar](../decisions/profiles-pillar.md).

## Start here

- [`src/pillars.ts`](../../src/pillars.ts) — `PILLARS`, the one registry: folder, core or not, starter files, next step. `activePillars(root)` is the only definition of "active".
- [`src/cli/add.ts`](../../src/cli/add.ts) — `addCommand`: starter files, then `updateCommand`.
- [`src/parser/profile.ts`](../../src/parser/profile.ts) — the profile grammar; [`src/renderers/profiles-index.ts`](../../src/renderers/profiles-index.ts) — the fit, as text.
- [`src/skills/harness-zero.skill.md`](../../src/skills/harness-zero.skill.md) — the signs that a project needs a pillar; the only place that says *when*.

## Invariants

- Active means the folder exists, nothing else: no manifest field, no configuration. `planInit` computes it on every render, so `lint:generated-fresh` sees a folder created or deleted by hand.
- A new pillar is three edits: a `PILLARS` entry, `pillars:` on the skill that serves it, a line in `buildUmbrellaBody`. `harness-zero` must name its `add` command and `ADDABLE_PILLARS` must give it a `next`; two tests fail otherwise.
- `add` never overwrites: an existing starter file is skipped, so re-running it completes a half-filled pillar.
- `add` writes starter files outside the managed locations (they are the project's, under `docs/`), so they never enter the manifest and `uninstall` leaves them. Only the two generated indexes are managed files.
- The pillars `add` accepts are those with a `starters` array, even empty. `skills` has none: dropping a `*.skill.md` is its activation.
- Profiles are never required by intents: `intent-profiles` checks `actors:` only while `docs/profiles/` exists.

## Traps

- **An empty pillar folder.** Git does not record it: the render would differ between the machine that has it and CI. `lint:doc-layout` fails on it. `add intents` and `add profiles` write no starter file, but the re-render writes their generated index, which is what git records. Before `init` there is no re-render: the folder stays empty until then.
- **Deleting the files is not removing the pillar.** `docs/intents/` holding only its generated `README.md` is still active. Removing a pillar is deleting the folder, then `update`.
- **`drift-detector` serves four pillars.** It leaves only when the last of handbook, tests, workflow and intents goes; a removal list that names it is not a bug.
- **Starter files fail the lint on purpose.** The test plans and the workflow template track placeholder paths. `add` says which skill fills them; do not soften the templates to make `add` end green.
- **A starter template must hold no example link.** `lint:cross-links` reads comments too: `[Title](./slug.md)` in a template is a broken link in every project that adds the pillar.
- **The profile parser imports `entitySlug` from a linter** (`intent-vocabulary`), so a pain and a spec entity get the same slug rule. Slugs are ASCII: an accented letter becomes a hyphen.
- **Pains and gains are scoped by actor.** `relieves: x` resolves against the profiles named in the intent *file's* `actors:`, not against every profile.
- **`harness-upgrade` is read from the installed version.** Its notes stop at that version; the skill tells the agent to read the target's copy from `node_modules` before applying.

## Procedures

- **Releasing a minor or a major**: add its entry to `harness-upgrade`, even "nothing to do" ([workflow §5](../workflow/coding-workflow.md)).
- **Trying it by hand**: `npm run build`, then in an empty folder with a README, `node <repo>/dist/cli/index.js init . --engines=claude-code` and `add decisions`.
