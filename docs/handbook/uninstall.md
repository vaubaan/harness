---
tracks:
  - src/cli/init.ts
  - src/cli/plan-render.ts
  - src/cli/update.ts
  - src/cli/uninstall.ts
  - src/cli/manifest.ts
  - src/cli/managed-paths.ts
  - src/cli/hook-configs.ts
  - src/cli/index.ts
  - tests/integration/uninstall.test.ts
  - tests/integration/init-safe.test.ts
  - tests/integration/legacy-migration.test.ts
last_reviewed: 2026-10-22
---

# Init and uninstall — lifecycle of managed files

`vaubaan-harness init <target-dir>` refreshes the rendering and removes
old managed files that are no longer needed. `uninstall <target-dir>` removes
the files owned by the harness. Files outside the manifest, and files
the project edited since the harness wrote them, are preserved according
to the rules below. Decisions: [safe lifecycle](../decisions/safe-project-artifact-lifecycle.md),
[safe init](../decisions/safe-init.md),
[no MCP, no code merge](../decisions/no-mcp-no-code-merge.md).
To update an existing installation while keeping its choices
and with a backup, use [the `update` command](./project-update.md).

## Mechanics

### Upfront validation

`assertManagedPaths` (`src/cli/managed-paths.ts`) checks the whole list
before any mutation. Paths must be relative, belong to native or legacy
managed locations, and contain no `..`, no `.`, no
empty segment, no backslash, no null byte. POSIX and
Windows absolute paths are refused. `AGENTS.md`, `CLAUDE.md`, the
manifest, the two Stop hook files and the engines' content
subdirectories make up the list of allowed locations. `.mcp.json`,
`.codex/config.toml`, `.opencode/opencode.json` and `.opencode/mcp.json`
are not managed locations any more.

Each existing component under the root is inspected with `lstatSync`.
A symbolic link, even internal or dangling, is refused, including on
the final file or the manifest. The root chosen by the caller may
itself be canonicalized through a link. A parent must be a
directory and the final destination a regular file, if it exists.

### Installation and reinstallation

`initCommand` (`src/cli/init.ts`) shares the planner of `update`,
`planInstallation` (`src/cli/update.ts`). It differs only in where the
settings come from: engines and the Stop hook come from the options;
preserved files and the overrides folder come from the previous
manifest, if any.

1. Paths 1.x edited entry by entry are dropped from the manifest with a
   warning and never touched again (`RELEASED_PATHS`,
   `src/cli/hook-configs.ts`).
2. The rendering (`planInit`, `src/cli/plan-render.ts`) gives the
   agents, skills, commands and umbrella; the Stop hook of each hook
   engine is rendered separately.
3. A generated path that already holds a file outside the manifest, or a
   managed file whose content no longer matches its recorded hash, is a
   conflict. All conflicts are reported in one error, before any write;
   `--preserve <path>` leaves a file to the project.
4. The two Stop hook files follow their own rule, without merge: see
   [Stop hook files](#stop-hook-files).
5. A `.harness-overrides/` folder in the project is loaded by default.
6. Writes and removals go through `applyUpdateTransaction`, with a
   backup and rollback. The backup is kept, and its path printed, only
   when an existing file was changed. Directories left empty by removals
   are pruned.

Re-running `init` with the same options writes nothing.

### Stop hook files

`.claude/settings.json` and `.codex/hooks.json` are shared with the
project. `planHookConfigs` (`src/cli/hook-configs.ts`) writes one only
when it is absent or when the manifest records it unchanged. An
existing file the harness does not own stays byte-for-byte as it is,
leaves the manifest, and a warning either prints the Stop hook block to
add or, when the file already contains `@vaubaan/harness stop-hook`,
says the file already runs the hook and stays the project's. No JSON is
parsed. Details and the removal rule:
[the update handbook](./project-update.md#stop-hook-files).

### Uninstallation

`uninstallCommand` (`src/cli/uninstall.ts`):

1. Validates the manifest path then reads it. If it is absent, returns
   a warning without mutation.
2. Sets aside the released paths, with a warning each, and validates
   the remaining managed files.
3. Calls `removeRenderedFiles` on them. A generated file whose content
   no longer matches its recorded hash is kept, with a
   `kept modified harness file` warning. A file already absent produces
   a warning, then cleanup continues. Directories that become empty are
   pruned up to the target directory.
4. Deletes the manifest.

The result exposes `{ filesRemoved, dirsPruned, warnings }`. A Stop
hook file is removed under the same rule as any generated file:
listed in the manifest and unchanged.

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

`tests/integration/init-safe.test.ts` covers the Stop hook files
(existing, already hooked, created then edited, preserved, disabled) and
the release of files 1.x edited. `tests/integration/legacy-migration.test.ts`
replays the real 0.9.0 manifest. The atomic path checks are tested next
to the CLI modules.

## Pitfalls

- **The manifest is not idempotent with respect to manual renames**. If you
  rename a file after `init`, `uninstall` warns "already missing"
  for the old path and leaves the new one intact (logical: it is no
  longer harness content, it is your file).
- **Manifest version**. `src/cli/manifest.ts` writes v6 and accepts
  v4, v5 and v6 when reading. v6 also records the package version
  and the fingerprints used by `update`. The 1.x entry ownership fields
  are dropped on read; what they covered is now the project's. An
  invalid manifest or one with an unsupported version makes the
  operation fail before mutation; inspect and repair the manifest
  before rerunning. For a valid v1 to v3 manifest, use `update`, which
  carries the legacy migration.
- **No `--force`**. Deliberate: if something is off, read the
  manifest, understand, act. A bypass flag would become a foot-gun.

## When to invoke it

- An ordinary update is done with `update`, which keeps the
  previous choices, detects modifications to managed files and backs up the
  affected files. `init` is for installing or explicitly reconfiguring.
- Before un-harnessing a project (rare).
- When debugging, to start again from a clean base.
