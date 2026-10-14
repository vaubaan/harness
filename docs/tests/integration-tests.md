---
tracks:
  - src/**/*.ts
  - tests/integration/**/*.ts
  - tests/fixtures/legacy-0.9/manifest.json
  - vitest.config.ts
last_reviewed: 2026-10-14
---

# Integration tests — @vaubaan/harness

## Scope

Tests that exercise the package's public functions end-to-end: parser → render → filesystem output. No filesystem mocking; we write into disposable `mkdtempSync` directories.

Contract covered: [harness spec](../spec/coding-agent-harness.md),
[renderer pipeline](../handbook/renderer-pipeline.md) and
[file lifecycle](../handbook/uninstall.md), as well as
[updating installations](../handbook/project-update.md).

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
  marker (the umbrella is now method-first and does not list
  the personas — each of them has its own file).
- 4 persona files under `.<engine>/agents/<id>.md` (`.toml` for codex-cli) (the
  multi-agent invariant is validated by this count, no longer by the umbrella marker).
- At least one rendered skill (engine-native path).
- At least one rendered command — except codex-cli, which has none
  (custom prompts deprecated).

Plus a "default = all 3 engines" test (init without `engines:` renders the
3 subdirectories + a single umbrella AGENTS.md) and a manifest test
(`engines[]` + `files[]`, current version `6`).

A re-init test checks that files from the previous manifest that are
no longer rendered after an engine is removed are deleted, their
empty directories pruned, and the user's files left
intact.

Optional quality pillar ([handbook](../handbook/quality-pillar.md)):
`AGENTS.md` mentions `docs/quality/code-quality.md` when the file
exists; the line is absent without `docs/quality/`, and also when the
directory exists without its required file.

File: `tests/integration/init.test.ts`.

### 2. `renderCommand` preview

We render in preview mode with the defaults (all 3 engines) and check
that AGENTS.md contains the "How we work" marker (the canonical
title of the umbrella) and that the 4 persona files are written under
`.<engine>/agents/<id>.md`, or `.toml` for Codex.

File: `tests/integration/init.test.ts`.

### 3. Linters on fixture repos

We bootstrap in-memory mini-repos and check:

- Minimally complete repo, without a `.car/` entry → `runLinters`
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

We load the harness from the repo root and check:

- 4 agents (1 per AgentId); **all rendered in parallel** on every
  `render()` call (no per-id selection at install time).
- 9 skills (8 doc + clean-code-guardian).
- 9 commands.
- Every `invokes_skill` points to an existing skill.
- All skills are deployed.
- Rendering works for the 3 engines in isolation **and** in
  "all engines" mode (the umbrella AGENTS.md is emitted only once, at the
  root, engine-neutral).

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

### 6. Shared OpenCode configuration

> Covers: [file lifecycle](../handbook/uninstall.md#shared-opencode-configuration).

`tests/integration/opencode-config.test.ts` exercises:

- Installing, re-initializing and removing context7 while keeping the
  project's model, permissions and other MCP servers.
- Pre-existing `context7` entry, identical or different: no
  overwrite and no ownership taken.
- Removing the MCP option and uninstalling a file created by the
  harness; settings added later by the user are kept.
- Managed entry edited after installation, already-empty `mcp` object and
  custom schema: user values preserved.
- User file deleted then recreated by the harness: its new
  ownership allows its later removal if it remains unchanged.
- v4 manifest containing a shared configuration: kept without
  adopting existing entries, then a v6 manifest is written.
- Invalid JSON configuration: re-init and uninstall fail
  before modifying the manifest, the personas or the invalid document.

### 7. Migrating the 0.9.0 layout

> Covers: [1.0 layouts](../decisions/engine-native-layouts-1-0.md)
> and [safe lifecycle](../decisions/safe-project-artifact-lifecycle.md).

`tests/integration/legacy-migration.test.ts` loads the real v4 manifest
produced by 0.9.0, kept in
`tests/fixtures/legacy-0.9/manifest.json`. The old files are
materialized with fixture content, then `init` renders the three
engines with context7. The test checks the removal of the old Markdown
agents and Codex skills/commands, of the old OpenCode skill
plugins and of `.opencode/mcp.json`. It checks the new paths,
the preservation of a custom plugin and of native OpenCode settings, then
the move to the current manifest with ownership of only the added entry.

### 8. Updating an existing installation

> Covers: [update contract](../spec/coding-agent-harness.md#updating-an-existing-installation)
> and [migration decision](../decisions/project-update-migrations.md).

`tests/integration/update.test.ts` exercises:

- v1 to v5 manifests to v6, with new TOML agents and native Codex
  skills; engines kept without implicitly enabling hooks.
- Preview with no write and no backup, apply then idempotent second
  invocation, and backup into an explicit directory.
- Byte-for-byte preservation of MCP and private settings when
  hooks are disabled; preservation of a partial hook selection.
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

### 9. Configurations and update transaction

These contracts are tested at module level, with real temporary
files, and complement the command scenarios:

- `src/cli/update-config.test.ts`: native MCP unchanged, migration of
  only the managed legacy MCP with priority to native names, previous
  ownership kept, legacy document outside the manifest left intact.
  Fix of the flat Codex hook, custom commands and events
  kept, hooks outside the manifest not adopted, removal of only the unchanged
  entries, user modifications and deletions respected.
  Invalid and symbolic configurations are rejected; uninstall
  preserves private settings and validates before removal.
- `src/cli/update-transaction.test.ts`: backup of bytes, modes and
  hashes before mutation, private permissions, unique default
  directory, ordered writes, restoration after injected errors,
  including after a file truncation. The rollback removes its new
  files and directories, keeps pre-existing ones and reports its
  own errors with the backup location. Backup failure,
  dangerous path, link, existing backup or backup located inside the target: no
  first project file is modified.

### 10. Removing CAR conventions

> Covers: [harness autonomy](../spec/coding-agent-harness.md#01-position)
> and [removal of CAR couplings](../decisions/retire-coding-agent-runner-coupling.md).

The lint integration fixture passes without `.car/`. The direct
`check` and `gitignore-harness` checks keep their cases for missing
harness entries and no longer enforce the retired runner's convention.

`src/cli/stop-hook.test.ts` goes through the dispatch, the adapters, Git and
the linters on a real temporary directory. For each of the three
engines, with a clean then a modified project, the old
`CAR_TURN_END_LOG` variable points to an existing log: its bytes stay
intact and no warning is written. The clean project lets the turn
finish; the modified project with failing lint keeps the native
continuation response.

### 11. OpenCode Stop-hook plugin, 1.x and 2.x

> Covers: [one plugin for V1 and V2](../decisions/opencode-v1-v2-stop-hook-plugin.md)
> and [the OpenCode continuation](../handbook/renderer-pipeline.md#opencode-hook-continuation).

`src/renderers/opencode-hook.test.ts` evaluates the emitted module and
runs both entry points of its default export against mocks:

- `server()` (1.x): persona recovered from the history, newer user
  selection, compaction summaries ignored, history failures, CLI exit
  codes that let the turn end, unrelated events.
- `setup()` (2.x): the definition exposes `id`, `server` and `setup`;
  `session.idle` runs the lint and prompts the same session with the
  report; other events, idle events without a session and idle events
  from another directory are ignored; exit codes 0, 1 and an empty
  report do not prompt; the returned cleanup aborts the subscription.

`src/renderers/renderers.test.ts` checks that the module has exactly one
export. Loading by the real OpenCode 1.14.50 and 2.0.29 binaries is a
manual check, recorded in
[the 14 October re-check](../research/2026-10-14-engine-recheck.md).

### 12. Generated paths in `.gitignore`

`lint:gitignore-harness` (`src/linters/linters.test.ts`) and `check`
(`src/cli/check.test.ts`) read one shared list, which includes
`.harness/` and `.mcp.json`: a complete `.gitignore` passes, and each
missing entry is reported.

## Known gaps
- The engine CLIs are not launched by the integration suite.
  The manual results, including the TOML spawn and the trusted Codex MCP,
  are in the [E2E plan](./e2e-tests.md).
- No integration test yet on `vaubaan-harness lint` invoked via subprocess (only direct tests of internal functions).
- No test on `.harness-overrides/` overrides loaded from a real worktree.
