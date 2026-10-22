---
tracks:
  - src/**/*.ts
  - tests/integration/**/*.ts
  - tests/fixtures/legacy-0.9/manifest.json
  - vitest.config.ts
last_reviewed: 2026-10-22
---

# Integration tests — @vaubaan/harness

## Scope

Tests that exercise the package's public functions end-to-end: parser → render → filesystem output. No filesystem mocking; we write into disposable `mkdtempSync` directories.

Contract covered: [harness spec](../spec/coding-agent-harness.md),
[renderer pipeline](../handbook/renderer-pipeline.md) and
[file lifecycle](../handbook/uninstall.md), as well as
[updating installations](../handbook/project-update.md) and
[linters architecture](../handbook/linters-architecture.md).

Unit tests (Zod parser, renderer snapshots, atomic linters) live next to the code in `src/**/*.test.ts` and are not listed here.

## Test stack

- Vitest as the runner.
- `node:fs` + `os.tmpdir()` to isolate each test.
- No docker, no network.

## Covered scenarios

### 1. `initCommand` per engine

Iterates over the 3 engines (`claude-code`, `codex-cli`, `opencode`).
For each engine, we call `init` with `engines: [<engine>]` and
check:

- At least one rendered file.
- `AGENTS.md` present and non-empty; it carries the "How we work"
  marker and the "Checks" section.
- No `.<engine>/agents/` file: the harness renders no persona.
- At least one rendered skill (engine-native path).
- At least one rendered command, except codex-cli, which has none
  (custom prompts deprecated).

An `init` without `engines`, or with an empty list, is refused with
`no engine selected` before any write. A manifest test checks
`engines[]`, `files[]` equal to the written files, the fingerprints and
the current version `6`.

A re-init test checks that files from the previous manifest that are
no longer rendered after an engine is removed are deleted, their
empty directories pruned, and the user's files left
intact.

Optional quality pillar ([handbook](../handbook/quality-pillar.md)):
`AGENTS.md` mentions `docs/quality/code-quality.md` when the file
exists; the line is absent without `docs/quality/`, and also when the
directory exists without its required file.

Project skills ([handbook](../handbook/project-skills.md)): a
`docs/skills/*.skill.md` file is rendered next to the stock skills and
listed in `AGENTS.md`; nothing changes when the folder is absent.

File: `tests/integration/init.test.ts`.

### 2. `renderCommand` preview

We render in preview mode with all three engines and check that
`AGENTS.md` contains the "How we work" marker and that the skills and
commands are written under their engine-native paths. An empty engine
list is refused.

Files: `tests/integration/init.test.ts`, `src/cli/render.test.ts`.

### 3. Linters on fixture repos

We bootstrap in-memory mini-repos and check:

- Minimally complete repo, whose `.gitignore` holds only
  `.harness-overrides/` and `.vaubaan/` → `runLinters`
  returns `pass: true`.
- Empty repo → `pass: false` with ≥ 5 errors.
- Repo with a tech keyword in `spec/` → `lint:spec-tech-agnostic` flagged.
- Repo with a malformed ADR → `lint:decision-schema` flagged.
- `--pillar=spec` filter → only `lint:spec-tech-agnostic` reports.
- Complete repo with `docs/quality/code-quality.md` with all 3 required
  sections → `pass: true`, no `lint:quality-schema` issue.
- Complete repo with a single-section `code-quality.md` →
  `pass: false`, 2 `lint:quality-schema` issues.

File: `tests/integration/lint-fixtures.test.ts`.

### 4. Loading the stock harness (dogfood)

We load the harness from `src/` and check:

- 8 skills (the doc writers, `doc-audit` and `drift-detector`).
- 8 commands.
- Every `invokes_skill` points to an existing skill.
- All skills are deployed on claude-code.
- Rendering works for the 3 engines in isolation **and** in
  "all engines" mode (the umbrella `AGENTS.md` is emitted only once, at the
  root, engine-neutral; no persona file anywhere).

File: `src/loader.test.ts`.

### 5. Validation before mutation

> Covers: [spec §13.1](../spec/coding-agent-harness.md#131-for-the-harnessed-project)
> and [safe lifecycle](../decisions/safe-project-artifact-lifecycle.md).

`tests/integration/init-safety.test.ts` checks that a re-init preserves
the old files and the manifest when an entry traverses to the
parent, when a new destination or the manifest is a symbolic
link, or when the manifest is invalid. Validation of a whole
batch of writes precedes writing the first file. Unit checks
of paths and of `uninstall` complete this coverage.

### 6. Files released to the project

> Covers: [no MCP, no code merge](../decisions/no-mcp-no-code-merge.md),
> [lint in CI and pre-commit](../decisions/lint-in-ci-and-pre-commit.md)
> and [file lifecycle](../handbook/uninstall.md#installation-and-reinstallation).

`tests/integration/init-safe.test.ts` exercises the paths 1.x wrote or
edited (`.mcp.json`, `.codex/config.toml`, `.claude/settings.json`, ...):

- Listed in a manifest, with 1.x ownership and Stop hook fields: each one
  is released with a `no longer managed by the harness` warning, left
  byte-for-byte by `init` and by `uninstall`, and gone from the new
  manifest.
- A `.claude/settings.json` or `.codex/hooks.json` containing
  `@vaubaan/harness stop-hook` produces a `remove the harness Stop hook
  entry` warning and is not touched.
- The harness never writes an engine settings, hook or MCP file.

### 7. Migrating the 0.9.0 layout

> Covers: [1.0 layouts](../decisions/engine-native-layouts-1-0.md)
> and [safe lifecycle](../decisions/safe-project-artifact-lifecycle.md).

`tests/integration/legacy-migration.test.ts` loads the real v4 manifest
produced by 0.9.0, kept in
`tests/fixtures/legacy-0.9/manifest.json`. The old files are
materialized with fixture content, then `init` renders the three
engines. The test checks the removal of every legacy file that is
neither released nor rendered again (old persona files, old Codex
skills/commands, old OpenCode plugins), the new skill paths, the
preservation of a custom plugin, and that the released files stay
byte-for-byte and leave the manifest with a warning.

### 8. Updating an existing installation

> Covers: [update contract](../spec/coding-agent-harness.md#updating-an-existing-installation)
> and [migration decision](../decisions/project-update-migrations.md).

`tests/integration/update.test.ts` exercises:

- v1 to v5 manifests to v6, with native Codex skills; engines kept, no
  hook or settings file written, old persona files removed.
- Preview with no write and no backup, apply then idempotent second
  invocation, and backup into an explicit directory.
- Byte-for-byte preservation of the project's own configuration files.
- A 1.x manifest with a hook preference and a Stop plugin: the
  preference is dropped, the plugin removed, and a Stop hook entry 1.x
  merged into `.claude/settings.json` triggers the warning to remove it.
- Refusal, before backup, of colliding files outside the manifest, of
  modifications detected by hash, of dangerous paths and of
  symbolic links, even those internal to the project.
- Explicit preservation of `AGENTS.md`, removal of its ownership and
  persistence of the choice on the next update.
- Loading local overrides, remembering their parent, and an error
  if they disappear or if `disable.yaml` is invalid. Reuse
  after the project is moved thanks to the relative parent `.`; explicit
  external overrides then remembered, with project skills rendered.
  Target without a manifest and unknown schema rejected.

### 9. Update transaction

Tested at module level, with real temporary files, complementing the
command scenarios:

- `src/cli/update-transaction.test.ts`: backup of bytes, modes and
  hashes before mutation, the manifest kept private (0600) and other
  files 0644 or their existing mode, unique default directory, ordered
  writes, restoration after injected errors, including after a file
  truncation. The rollback removes its new files and directories, keeps
  pre-existing ones and reports its own errors with the backup
  location. Backup failure, dangerous path, link, existing backup or
  backup located inside the target: no first project file is modified.

### 10. Removing CAR conventions

> Covers: [harness autonomy](../spec/coding-agent-harness.md#01-position)
> and [removal of CAR couplings](../decisions/retire-coding-agent-runner-coupling.md).

The lint integration fixture passes without `.car/`. The direct
`check` and `gitignore-harness` checks keep their cases for missing
harness entries and no longer enforce the retired runner's convention.

### 11. `.gitignore` semantics

> Covers: [generated files committed](../decisions/generated-files-committed.md).

`lint:gitignore-harness` (`src/linters/linters.test.ts`) and `check`
(`src/cli/check.test.ts`) share the same helpers:

- `.harness-overrides/` and `.vaubaan/` are required; each missing entry
  is reported.
- `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `.agents/`,
  `.opencode/` and `.harness-manifest.json` must not be ignored; each
  forbidden entry is reported.
- Entries with or without a trailing slash, with or without a leading
  slash, and comment lines are normalized the same way.
- A missing `.gitignore` is one issue, with no per-entry issue.

### 12. Generated files are current

> Covers: [generated files committed](../decisions/generated-files-committed.md)
> and [linters architecture](../handbook/linters-architecture.md#rendered-files-are-current--generated-fresh).

`tests/integration/generated-fresh.test.ts` installs the harness from
`src/` into a temporary project, then:

- A fresh install passes `lint:generated-fresh`.
- An edited generated file, a deleted one, and a stale file left from a
  previous manifest are each reported, with `update` as the fix.
- A preserved file and a released path are skipped.
- The render uses the project's overrides and `docs/skills/`, so a
  committed copy of them passes.
- A project without a manifest reports nothing; an invalid manifest is
  reported as one issue instead of crashing the linter.

### 13. Safe `init`

> Covers: [safe init](../decisions/safe-init.md) and
> [installation and reinstallation](../handbook/uninstall.md#installation-and-reinstallation).

`tests/integration/init-safe.test.ts`:

- Hand-written `AGENTS.md` and `CLAUDE.md`: one error lists both, nothing
  is written. With `--preserve AGENTS.md`, the file is kept, recorded and
  survives `uninstall`.
- `.harness-overrides/` in the project is loaded by default.
- Re-running `init` with the same engines writes nothing and keeps no
  backup; a generated file edited since stops the run.
- `init` after `update --preserve` keeps the preserved file.
- Duplicate engines are collapsed; an empty selection is refused.
- `uninstall` keeps an edited generated file with a warning.

## Known gaps

- The engine CLIs are not launched by the integration suite.
  The manual results are in the [E2E plan](./e2e-tests.md).
- No integration test yet on `vaubaan-harness lint` invoked via subprocess (only direct tests of internal functions).
- No test on `.harness-overrides/` overrides loaded from a real worktree.
