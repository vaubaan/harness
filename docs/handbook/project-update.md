---
tracks:
  - src/cli/update.ts
  - src/cli/update-manifest.ts
  - src/cli/update-transaction.ts
  - src/cli/update-transaction.test.ts
  - src/cli/manifest.ts
  - src/cli/managed-paths.ts
  - src/cli/init.ts
  - src/cli/plan-render.ts
  - src/cli/index.ts
  - src/index.ts
  - src/version.ts
  - tests/integration/update.test.ts
  - tests/integration/init-safe.test.ts
last_reviewed: 2026-10-22
---

# Updating a project

`vaubaan-harness update` re-renders an existing installation with the
contents of the running package. The contract is described in the
[spec](../spec/coding-agent-harness.md#updating-an-existing-installation),
and the decisions in [project-update-migrations](../decisions/project-update-migrations.md)
and [no-mcp-no-code-merge](../decisions/no-mcp-no-code-merge.md).
This command does not install an npm package and does not launch the
engines. Since the generated files are committed
([decision](../decisions/generated-files-committed.md)), an update ends
with a commit of its output; `lint:generated-fresh` fails until then.

## Invocation and result

```bash
vaubaan-harness update . --dry-run --json
vaubaan-harness update .
```

The target defaults to `.`. The options are:

| Option | Effect |
|---|---|
| `--dry-run` | Prepares and validates the plan, without writing or backup. |
| `--json` | Returns the structured summary on stdout; warnings are in the result. |
| `--backup-dir <dir>` | Exact new folder, outside the project, for this run's backup. |
| `--overrides-dir <dir>` | Parent of the `.harness-overrides/` directory to use. |
| `--preserve <paths>` | Comma-separated relative paths, handed over to project ownership and remembered. |

Without an overrides option, the parent recorded in the manifest is
reused; failing that, the project's local overrides are loaded.
The local parent is recorded as `.` relative to the target, so that it
remains usable after the project is moved; an external parent
is recorded as its absolute path.
An explicitly provided or remembered parent whose `.harness-overrides/`
has disappeared produces an error before mutation.
A `disable.yaml` that is present but invalid is also refused during
preparation.

`UpdateResult` (`src/cli/update.ts`) exposes `version`,
`fromManifestVersion`, `dryRun`, `upToDate`, `filesToWrite`,
`filesToRemove`, `warnings` and, after applying, `backupDir`.
A plan that is already up to date writes nothing and creates no backup.
The text output ends with `next: commit the generated files` when
something was written.

The API is exported from the package root:

```ts
import { planUpdate, updateCommand } from "@vaubaan/harness";

const preview = planUpdate({ targetDir: "/path/to/project" });
console.log(preview.result);
const result = updateCommand({ targetDir: "/path/to/project", dryRun: true });
```

`planUpdate` also exposes the plan's contents to its internal caller;
the CLI JSON summary is limited to `UpdateResult`.

## Reading legacy installations

`readUpdateInstallation` (`src/cli/update-manifest.ts`) requires a
`.harness-manifest.json` and normalizes the old shapes:

- v1: an `engine` field; v2 and v3: a non-empty `engines` array.
- v4, v5 and v6: read through the current schema of `src/cli/manifest.ts`.
  The fields 1.x wrote and 2.0 ignores are dropped as unknown keys: the
  entry ownership of shared files (`hookConfigs`, `opencodeConfig`,
  `mcpConfig`) and the Stop hook preference (`stopHookInstalled`,
  `stopHookEngines`).
- Unknown versions, unknown engines and invalid documents: error
  before mutation. A target without a manifest is a job for `init`.

The old schema is accepted only through this migration path.
`init` and `uninstall` keep using the current reader.

The engines come from the manifest and only from it: `update` has no
engine option. To change engines, run `init` again with `--engines`.

## File preparation and conflicts

`planUpdate` in `src/cli/update.ts` reads the installation, then calls
`planInstallation`, the planner it shares with `init`
([safe init](../decisions/safe-init.md)). `update` passes the engines
recorded in the manifest; `init` passes its mandatory `--engines`. The
planner calls `planInit` (`src/cli/plan-render.ts`) for the skills,
commands, project skills and umbrella, and removes the paths handed
over to the user via `preservedFiles` or `--preserve`.

Before anything else, `releaseLegacyPaths` drops from the manifest's
file list the paths 1.x used to write or edit and 2.0 never touches
again (`RELEASED_PATHS`, `src/cli/managed-paths.ts`): `.mcp.json`,
`.codex/config.toml`, `.opencode/opencode.json`, `.opencode/mcp.json`,
`.claude/settings.json`, `.codex/hooks.json`. Each one produces a
`no longer managed by the harness, left in place` warning, once; the
file stays as the project's.

`legacyHookWarnings` then reads `.claude/settings.json` and
`.codex/hooks.json` if they exist: a content containing
`@vaubaan/harness stop-hook` produces a `remove the harness Stop hook
entry from <path>` warning. That command is a hidden no-op in 2.0 so an
un-migrated entry does not fail every turn; it disappears in 3.0. The
harness never edits these files itself.

`assertManagedPaths` validates the old references, the destinations
and the removals. Symbolic links under the target are refused, even
if their target is internal; `--preserve` does not bypass this rule.
The managed locations are `AGENTS.md`, `CLAUDE.md`, the manifest and
the engines' content subdirectories, including the legacy ones
(`.<engine>/agents/`, `.codex/skills/`, `.opencode/plugins/`) so that an
update can remove what an older version rendered there.

For every generated file:

- An existing file outside the manifest blocks generation, even if its
  name matches the new layout. Move it deliberately after
  carrying its customization over into an override, or keep it with
  `--preserve` depending on its ownership.
- If a fingerprint exists, modified content blocks the update,
  unless it already matches the new rendering exactly.
- All conflicts are collected and reported in one error, so a single
  run lists every file to resolve.
- An old managed file without a fingerprint is regenerated with a warning and
  backed up before mutation. No unlisted content is adopted by
  inference from its name.
- A file the manifest lists and the new render no longer produces is
  removed, if unchanged. This is how a 1.x installation loses its
  persona files and its OpenCode Stop plugin on the first `update`.

The v6 manifest records `harnessVersion`, `fileHashes` (SHA-256),
`preservedFiles` and the overrides parent used. Preserved files
no longer appear in the list of generated artifacts. The manifest is
the plan's last write. Unchanged files and deletions
already in effect are omitted from the applied batch.

`--preserve` concerns generated artifacts, for example `AGENTS.md`. The
manifest is not an allowed value.

## Backup and restore on error

`applyUpdateTransaction` (`src/cli/update-transaction.ts`) validates the complete
batch before creating the backup. The default folder is
`~/.local/state/vaubaan-harness/backups/<uuid>`; `--backup-dir` must
designate a nonexistent folder, outside the target and without a symbolic
ancestor. The target directory itself may have been canonicalized.

The backup contains `files/<relative-path>` for each pre-existing
file touched and a `snapshot.json` that records presence, mode
and fingerprint. New backup directories are private (0700),
files 0600; each written file is synced with `fsync`.
An incomplete backup makes the operation fail without modifying the
project.

The manifest is always written as 0600, by `init` as well as by
`update`; every other generated file is created as 0644 and a
pre-existing file keeps its mode. A rollback restores each file's
original mode, including the manifest's.

Applying removes the old files then writes the new ones,
with the manifest last. On error, it restores in reverse
order the bytes and modes of the touched files, removes the outputs
that did not exist and the directories it just created if they
are empty. It does not delete pre-existing directories that became
empty. The message distinguishes `rollback completed` from a list of restore
errors and always gives the path of the kept backup.

There is no lock against concurrent modifications of the project.
The backup remains available after success or failure; no automatic
purge is performed. This command exposes no manual restore
subcommand: after a rollback failure, inspect the
snapshot and the backed-up files before a targeted retry.

## Diagnostics

- **No manifest**: use `init --engines=...` for a first installation.
- **Old manifest rejected by `init`**: use `update`, which carries
  the v1 to v3 migrations.
- **Modified file**: move the customization into the overrides,
  or use for example `--preserve AGENTS.md` to stop generating it.
- **`no longer managed by the harness`**: a file 1.x wrote or edited is
  now yours; nothing to do, the warning appears once.
- **`remove the harness Stop hook entry`**: delete that entry from your
  engine settings by hand; run `npx @vaubaan/harness lint` in CI and
  pre-commit instead.
- **`lint:generated-fresh` fails after the update**: commit the files
  `update` wrote.
- **Symbolic link**: explicitly convert the link while respecting
  its target; link targets are never deleted automatically.
- **External override missing**: provide its real parent or restore the
  directory before rerunning.
- **Backup already exists or is inside the project**: choose a new folder
  outside it, or leave the default value.

The integration scenarios and their limits are described in the
[test plan](../tests/integration-tests.md).
