---
title: Overrides loading
tracks:
  - src/render.ts
  - src/loader.ts
  - src/cli/update.ts
  - src/cli/plan-render.ts
  - src/cli/index.ts
last_reviewed: 2026-10-27
---

# Overrides loading — handbook

How a developer's local `.harness-overrides/` adds, replaces or disables skills and commands on top of the stock. Spec: [§11](../spec/coding-agent-harness.md#11-gitignored-overrides).

## Start here

- [`src/loader.ts`](../../src/loader.ts) — `loadOverrides`, which reuses `loadHarness` on `skills/` and `commands/` plus `disable.yaml`.
- [`src/render.ts`](../../src/render.ts) — `applyOverrides` and the merge order.
- [`src/cli/update.ts`](../../src/cli/update.ts) — `planInstallation`: which overrides folder `init` and `update` use, and its validation.

## Invariants

- Merge order, fixed: stock → project skills (`docs/skills/`) → overrides `add` → `disable`. Same `id` = the later one wins; `disable.yaml` is the final authority, even over an `add`.
- Override files go through the same strict parsing as stock skills: a malformed override fails the render like a malformed stock skill.
- The overrides parent is recorded in the manifest (`overridesDir`, `.` for the project's own folder) so `update` and `lint:generated-fresh` replay the same overrides. Without `--overrides-dir`, the recorded parent is used, else the target directory.

## Traps

- `loadOverrides` silently treats an unreadable or mis-shaped `disable.yaml` as "disable nothing". Only the CLI path (`planInstallation`) refuses it with `invalid override selection`; a direct API caller of `render()` gets no error.
- A recorded or explicit overrides parent whose `.harness-overrides/` has disappeared is an error before any write, not a silent fallback to the stock.
- `render` (the preview command) never applies overrides, by design. To preview with overrides, `init` into a scratch directory.
- `.harness-overrides/` is gitignored (`lint:gitignore-harness`) but what it renders is committed: a personal override lands in the team's generated files and makes `lint:generated-fresh` fail for everyone else. A skill meant for the team goes in `docs/skills/` ([project skills](./project-skills.md)).

## Debug

- **Override ignored** — the file is not `*.skill.md` / `*.cmd.md`, or it sits in a subfolder (the glob is not recursive).
- **`disable.yaml` has no effect** — the shape must be exactly `disable: [id, …]`.
