---
title: Updating a project
tracks:
  - src/cli/update.ts
  - src/cli/update-manifest.ts
  - src/cli/update-transaction.ts
  - src/cli/manifest.ts
  - src/cli/managed-paths.ts
  - src/cli/index.ts
  - tests/integration/update.test.ts
last_reviewed: 2026-10-27
---

# Updating a project — handbook

`vaubaan-harness update` re-renders an existing installation with the running package's content, keeping its engines, preserved files and overrides. Spec: [updating an existing installation](../spec/coding-agent-harness.md#updating-an-existing-installation); decision: [safe init](../decisions/safe-init.md).

## Start here

- [`src/cli/update.ts`](../../src/cli/update.ts) — `planInstallation`, the planner `init` shares, and `planUpdate` / `updateCommand`.
- [`src/cli/update-manifest.ts`](../../src/cli/update-manifest.ts) — the only reader of v1-v3 manifests.
- [`src/cli/update-transaction.ts`](../../src/cli/update-transaction.ts) — backup, apply, rollback.

## Invariants

- Every read and validation happens before the backup, and the backup before the first mutation; the manifest is the last write. A failure at any step before applying leaves the project untouched.
- Engines come from the manifest only: `update` has no engine option, changing engines is `init --engines`.
- Old manifests (v1-v3) are accepted by `update` only; `init` and `uninstall` use the current reader (v4-v6) and fail on them. Fields 1.x wrote (shared-file ownership, Stop hook preference) are dropped on read.
- The 1.x paths in `RELEASED_PATHS` (MCP files, engine settings) leave the manifest with a one-time warning and are never written, edited or removed again.

## Traps

- A manifest without `fileHashes` (pre-v6) cannot detect hand edits: its managed files are regenerated with a warning, and only the backup keeps the old bytes.
- A modified generated file blocks the run unless its content already equals the new render; all conflicts are listed in one error.
- The `stop-hook` CLI command is a hidden no-op kept so a 1.x Stop hook entry does not fail every turn; `update` warns when `.claude/settings.json` or `.codex/hooks.json` still calls it. It goes away in 3.0.
- Backups default to `~/.local/state/vaubaan-harness/backups/<uuid>`, private (0700/0600), and are never purged. They may hold sensitive bytes: never point `--backup-dir` inside a repo (it is refused inside the target anyway).
- The manifest is always written 0600; there is no lock against another process changing the project during the run.
- No restore subcommand exists: after `rollback errors`, inspect `snapshot.json` and `files/` in the printed backup directory before retrying.

## Debug

- **`no harness manifest found`** — first install: use `init --engines=…`.
- **`recorded overrides are missing`** — the parent stored in `overridesDir` no longer has `.harness-overrides/`; restore it or pass `--overrides-dir`.
- **`symbolic link in harness path`** — convert the link by hand; `--preserve` does not bypass the check.
- **`lint:generated-fresh` still fails after `update`** — the written files are not committed yet.
