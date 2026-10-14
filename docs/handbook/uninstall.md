---
tracks:
  - src/cli/init.ts
  - src/cli/plan-render.ts
  - src/cli/update.ts
  - src/cli/uninstall.ts
  - src/cli/manifest.ts
  - src/cli/managed-paths.ts
  - src/cli/opencode-config.ts
  - src/cli/update-config.ts
  - src/cli/index.ts
  - tests/integration/uninstall.test.ts
  - tests/integration/opencode-config.test.ts
  - tests/integration/init-safe.test.ts
last_reviewed: 2026-10-14
---

# Init and uninstall — lifecycle of managed files

`vaubaan-harness init <target-dir>` refreshes the rendering and removes
old managed files that are no longer needed. `uninstall <target-dir>` removes
the files owned by the harness. Custom files outside the manifest
and shared OpenCode settings are preserved according to the rules
below. Decision: [safe lifecycle](../decisions/safe-project-artifact-lifecycle.md).
To update an existing installation while keeping its choices
and with a backup, use [the `update` command](./project-update.md).

## Mechanics

### Upfront validation

`assertManagedPaths` (`src/cli/managed-paths.ts`) checks the whole list
before any mutation. Paths must be relative, belong to native or legacy
managed locations, and contain no `..`, no `.`, no
empty segment, no backslash, no null byte. POSIX and
Windows absolute paths are refused. `AGENTS.md`, `CLAUDE.md`, the known
configuration files and the engines' content subdirectories
make up the list of allowed locations.

Each existing component under the root is inspected with `lstatSync`.
A symbolic link, even internal or dangling, is refused, including on
the final file or the manifest. The root chosen by the caller may
itself be canonicalized through a link. A parent must be a
directory and the final destination a regular file, if it exists.

### Installation and reinstallation

Since 1.4.0, `initCommand` (`src/cli/init.ts`) shares the planner of
`update`, `planInstallation` (`src/cli/update.ts`). It differs only in
where the settings come from: engines, MCP servers and the Stop hook come
from the options; preserved files, entry ownership and the overrides
folder come from the previous manifest, if any. Decision:
[safe init](../decisions/safe-init.md).

1. The rendering (`planInit`, `src/cli/plan-render.ts`) is split into
   generated files and shared configurations.
2. A generated path that already holds a file outside the manifest, or a
   managed file whose content no longer matches its recorded hash, is a
   conflict. All conflicts are reported in one error, before any write;
   `--preserve <path>` leaves a file to the project.
3. Shared configurations are merged entry by entry: Stop hooks in
   `.claude/settings.json` and `.codex/hooks.json` (`planUpdateConfigs`),
   MCP servers in `.opencode/opencode.json` and `.mcp.json`
   (`planOpenCodeConfig`, `planClaudeMcpConfig`). The manifest records the
   owned entries in `hookConfigs`, `opencodeConfig` and `mcpConfig`.
4. `.codex/config.toml` is written only if absent, or created by the
   harness and unchanged. Otherwise it is left alone and a warning prints
   the `[mcp_servers.<id>]` block to add.
5. A `.harness-overrides/` folder in the project is loaded by default.
6. Writes and removals go through `applyUpdateTransaction`, with a
   backup and rollback. The backup is kept, and its path printed, only
   when an existing file was changed. Directories left empty by removals
   are pruned.

Re-running `init` with the same options writes nothing.

### Uninstallation

`uninstallCommand` (`src/cli/uninstall.ts`):

1. Validates the manifest path then reads it. If it is absent, returns
   a warning without mutation.
2. Validates all the paths and prepares the removal of only those
   OpenCode and `.mcp.json` entries and shared hooks whose ownership is
   recorded.
3. Calls `removeRenderedFiles` on the managed files. A generated file
   whose content no longer matches its recorded hash is kept, with a
   `kept modified harness file` warning. A file already absent produces
   a warning, then cleanup continues. Directories that become empty are
   pruned up to the target directory.
4. Writes the remaining shared configuration if needed, then deletes
   the manifest.

The result exposes `{ filesRemoved, dirsPruned, warnings }`. The
shared configuration can be modified without appearing in
`filesRemoved`, since it stays in the project.

### Shared OpenCode configuration

`planOpenCodeConfig` (`src/cli/opencode-config.ts`) prepares the changes
to `.opencode/opencode.json` before writing. A document affected by
an installation or a removal with ownership must be a JSON object,
with an `mcp` object if present; an invalid shape is rejected.

`init --with-mcp=context7` only adds an absent entry. An
existing entry stays unchanged, even if it differs from the
renderer's; a warning reports this difference. The other servers,
agents, permissions and settings are kept.

Since manifest v5, this shared file is excluded from `files[]`. The
`opencodeConfig` field contains `createdFile`, `addedMcp`, `addedSchema` and
`entries` (exact values of the added servers). A pre-existing entry,
even one identical to the rendering, is not claimed by the harness.

When the MCP option is removed or during an `uninstall`, each recorded
entry is deleted only if it still matches its
installed value (`isDeepStrictEqual`). A modified entry stays, with
a warning. The empty `mcp` container and the default `$schema` are
removed only if they were added by the harness; a modified
schema stays. The file itself is deleted only if it was
created by the harness and becomes empty. A re-init with no change does not
needlessly rewrite this document.

### Shared hooks after `update`

The `update` command records ownership of the Claude and
Codex Stop entries under `hookConfigs`, without owning their entire JSON file.
`planHookConfigCleanup` (`src/cli/update-config.ts`) prepares their removal
before any generated file is deleted. An entry is removed only
if the command and its group's metadata still match
the snapshot. Modified commands, other hooks and user
settings remain. A container or file that becomes empty
is removed only if it was created by the harness.

This mechanism concerns ownership recorded by `update`; `init`
still renders its hooks as files. For migration and preservation
details, see [the update handbook](./project-update.md#shared-mcp-and-hooks).

## Safeguards

- **The manifest indicates ownership, but does not authorize any path**.
  Location and link validation applies even to a
  listed entry. A manual edit can still change the list
  of legitimate managed files that get removed; the manifest is not signed.
- **No brute-force recursion**. `pruneEmptyDirs` only deletes a dir
  if it is *empty* after the manifest files are removed. A
  dir containing user files outside the manifest is not
  touched.
- **No climbing out of the target**. The pruning loop stops
  at the root and destinations are checked before deletion.
- **No transaction against concurrent modifications**. The
  validations apply to the inspected filesystem; later I/O
  errors do not trigger a global rollback.

## Cases covered by the tests

`tests/integration/uninstall.test.ts`:

1. **`init` → `uninstall` round-trip** — every file emitted by
   `init` is listed in `result.filesRemoved`; the target dir is
   completely empty at the end.
2. **No manifest** — soft exit with a warning, no effect.
3. **Preservation of user files** — custom files are injected
   into `.claude/skills/user-custom/SKILL.md` + a `user-notes.md`
   at the root; after `uninstall`, they are intact.
4. **`init → uninstall → init` cycle** — the 2nd installation produces
   exactly the same list of files as the 1st.

`tests/integration/opencode-config.test.ts` covers preservation of
pre-existing settings and servers, name collisions, re-init,
MCP removal, user modifications after installation and
the conservative migration of the v4 configuration. The atomic
path checks are tested next to the CLI modules.

## Pitfalls

- **The manifest is not idempotent with respect to manual renames**. If you
  rename a file after `init`, `uninstall` warns "already missing"
  for the old path and leaves the new one intact (logical: it is no
  longer harness content, it is your file).
- **Manifest version**. `src/cli/manifest.ts` writes v6 and accepts
  v4, v5 and v6 when reading. v6 also records the package version
  and the fingerprints used by `update`. An OpenCode configuration listed in a
  v4 manifest without detailed ownership is kept with a warning, including at
  uninstall. Entries already present are not adopted
  during a re-init. An invalid manifest or one with an unsupported
  version makes the operation fail before mutation; inspect and
  repair the manifest before rerunning. For a valid v1 to
  v3 manifest, use `update`, which carries the legacy migration.
- **No `--force`**. Deliberate: if something is off, read the
  manifest, understand, act. A bypass flag would become a foot-gun.

## When to invoke it

- An ordinary update is done with `update`, which keeps the
  previous choices, detects modifications to managed files and backs up the
  affected files. `init` is for installing or explicitly reconfiguring.
- Before un-harnessing a project (rare).
- When debugging, to start again from a clean base.
