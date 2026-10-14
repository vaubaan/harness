---
tracks:
  - src/cli/update.ts
  - src/cli/update-manifest.ts
  - src/cli/update-config.ts
  - src/cli/update-config.test.ts
  - src/cli/update-transaction.ts
  - src/cli/update-transaction.test.ts
  - src/cli/manifest.ts
  - src/cli/managed-paths.ts
  - src/cli/init.ts
  - src/cli/index.ts
  - src/index.ts
  - src/version.ts
  - tests/integration/update.test.ts
last_reviewed: 2026-09-20
---

# Updating a project

`vaubaan-harness update` migrates an existing installation with the
contents of the running package. The contract is described in the
[spec](../spec/coding-agent-harness.md#updating-an-existing-installation),
and the decision in [project-update-migrations](../decisions/project-update-migrations.md).
This command does not install an npm package and does not launch the engines.

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
The lists give paths, not the content of configurations.
A plan that is already up to date writes nothing and creates no backup.

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
- Unknown versions, unknown engines and invalid documents: error
  before mutation. A target without a manifest is a job for `init`.

The old schema is accepted only through this migration path.
`init` and `uninstall` keep using the current reader.

Stop hooks follow this priority order: explicit disabling
`stopHookInstalled: false`, then recorded `stopHookEngines`, then all
engines if activation is explicit without a list. When these fields
are missing, only the hook references present in `files[]`
determine the engines concerned. A custom hook outside the manifest therefore
does not implicitly become a harness hook. Hook engines
must belong to the installation's engines.

## File preparation and conflicts

`planUpdate` in `src/cli/update.ts` reuses `planInit` for the
agents, skills, commands and project skills, with hooks handled
separately. It then prepares the shared configurations and removes
the paths handed over to the user via `preservedFiles` or
`--preserve`.

`assertManagedPaths` validates the old references, the destinations
and the removals. Symbolic links under the target are refused, even
if their target is internal; `--preserve` does not bypass this rule.

For a generated file outside shared configuration:

- An existing file outside the manifest blocks generation, even if its
  name matches the new layout. Move it deliberately after
  carrying its customization over into an override, or keep it with
  `--preserve` depending on its ownership.
- If a fingerprint exists, modified content blocks the update,
  unless it already matches the new rendering exactly.
- An old managed file without a fingerprint is regenerated with a warning and
  backed up before mutation. No unlisted content is adopted by
  inference from its name.

The v6 manifest records `harnessVersion`, `fileHashes` (SHA-256),
`preservedFiles` and the overrides parent used. Preserved files
no longer appear in the list of generated artifacts. The manifest is
the plan's last write. Unchanged files and deletions
already in effect are omitted from the applied batch.

`--preserve` concerns generated artifacts, for example `AGENTS.md`.
The manifest and shared configurations are not allowed
values: these follow the per-entry ownership rules below.

## Shared MCP and hooks

`planUpdateConfigs` (`src/cli/update-config.ts`) handles settings
separately from generated files. `.mcp.json` and `.codex/config.toml`
stay byte-for-byte identical. The command does not add a new
MCP server simply because an engine is installed.

If the old `.opencode/mcp.json` is listed in the manifest and exists,
its servers absent from `.opencode/opencode.json` are added in the native
format; a native entry with the same name takes priority. Existing native
settings are kept. Only the additions are recorded in
`opencodeConfig`, then the old managed file is removed. A
legacy file outside the manifest stays intact and is not migrated. When there is no
migration, the native file stays unchanged.

For Claude and Codex, the plan keeps the user's events, commands and other
settings in `.claude/settings.json` and `.codex/hooks.json`.
It recognizes the exact command `npx -y @vaubaan/harness stop-hook
--engine <claude|codex>`: an old flat Codex entry, in a
managed file, becomes a native `hooks: [...]` group. An existing command
outside the manifest is neither adopted, nor corrected, nor duplicated.
When a hook is enabled and absent, a native entry is added.

`hookConfigs` records the ownership of each entry and the metadata
of its group, as well as the containers and files created. The shared JSON
files leave `files[]`. During a later update,
an owned entry that the user then modified or deleted is
not automatically restored; a warning explains why it was kept.
`uninstall` removes only the entries still identical to the snapshot,
and removes empty containers or files only if it created them.
The OpenCode Stop plugin remains an ordinary generated file, protected by
its fingerprint.

The JSON files concerned are parsed and validated during preparation. An
invalid shape therefore stops the operation before backup or mutation.

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
project. These copies may contain sensitive configurations and
stay out of the repository.

The manifest, which may contain snapshots of private configuration
entries, is always written as 0600, by `init` as well as by `update`.
During `update`, new shared configuration files are
also created as 0600; pre-existing configurations keep
their mode. A rollback restores each file's original mode,
including the manifest's.

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

- **No manifest**: use `init` for a first installation.
- **Old manifest rejected by `init`**: use `update`, which carries
  the v1 to v3 migrations.
- **Modified file**: move the customization into the overrides,
  or use for example `--preserve AGENTS.md` to stop generating it.
- **Symbolic link**: explicitly convert the link while respecting
  its target; link targets are never deleted automatically.
- **External override missing**: provide its real parent or restore the
  directory before rerunning.
- **Backup already exists or is inside the project**: choose a new folder
  outside it, or leave the default value.

The integration scenarios and their limits are described in the
[test plan](../tests/integration-tests.md).
