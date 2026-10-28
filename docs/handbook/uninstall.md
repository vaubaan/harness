---
title: File lifecycle (init and uninstall)
tracks:
  - src/cli/init.ts
  - src/cli/update.ts
  - src/cli/uninstall.ts
  - src/cli/manifest.ts
  - src/cli/managed-paths.ts
  - tests/integration/uninstall.test.ts
  - tests/integration/init-safe.test.ts
  - tests/integration/legacy-migration.test.ts
last_reviewed: 2026-10-27
---

# File lifecycle — handbook

Which files `init` writes or removes, what `uninstall` deletes, and the path checks that guard both. Spec: [§12](../spec/coding-agent-harness.md#12-security) and [§13.1](../spec/coding-agent-harness.md#131-for-the-harnessed-project); decision: [safe init](../decisions/safe-init.md).

## Start here

- [`src/cli/managed-paths.ts`](../../src/cli/managed-paths.ts) — `assertManagedPaths`, the managed locations and `RELEASED_PATHS`.
- [`src/cli/init.ts`](../../src/cli/init.ts) — `initCommand`, a thin caller of the shared planner `planInstallation` ([updating a project](./project-update.md)).
- [`src/cli/uninstall.ts`](../../src/cli/uninstall.ts) — `uninstallCommand`, `pruneEmptyDirs`.

## Invariants

- Every path of a batch is validated before the first write or delete: relative, inside the managed locations (`AGENTS.md`, `CLAUDE.md`, the manifest, the engines' content folders, legacy ones included so old output can be removed), no `..`, no symbolic component under the target. One bad entry at the end of the list aborts before anything is touched.
- The manifest says what the harness owns, never where it may write: a listed path still goes through the location and link checks. A hand-edited manifest can change which managed files get removed, never reach outside them.
- `init` and `update` never overwrite a file outside the manifest or edited since it was written; `uninstall` keeps an edited generated file with `kept modified harness file`.
- Directory pruning removes only folders left empty, stopping at the target root.

## Traps

- `init` keeps a backup only when it changed a file that already existed (or `--backup-dir` was given); a first install leaves no backup behind.
- Dropping an engine on a re-`init` removes its unchanged files and prunes the folder; an edited file there stops the run as a conflict.
- `uninstall` on a 1.x install leaves `RELEASED_PATHS` in place with a warning: they are the project's files now.
- A file renamed after `init` is no longer harness content: `uninstall` warns `already missing` for the old path and leaves the new one.
- There is no `--force`, by design: resolve conflicts with `--preserve <path>` or by moving content to `docs/` / `.harness-overrides/`.
- After `init`, `update` or `uninstall`, commit the result: the generated files are versioned ([decision](../decisions/generated-files-committed.md)).

## Debug

- **`path is outside harness-managed locations`** — a manifest lists a path that is not generated output (often a hand edit); repair the manifest.
- **`Invalid enum value` reading the manifest on `init`** — a v1-v3 manifest: run `update` once, it carries the migration.
