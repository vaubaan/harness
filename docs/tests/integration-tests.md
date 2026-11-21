---
title: Integration test plan
tracks:
  - vitest.config.ts
  - tests/integration/**/*.ts
  - tests/fixtures/legacy-0.9/manifest.json
last_reviewed: 2026-11-21
---

# Integration test plan

## Scope

- The package's public functions assembled end to end (parser → render
  → filesystem, planner → transaction, linters on fixture repos), on a
  real temporary filesystem. Contract: the
  [harness spec](../spec/coding-agent-harness.md).
- Unit tests live next to the code (`src/**/*.test.ts`); a few of them
  (`update-transaction`, `check`, `linters`) cover integration-level
  behavior at module level and are not repeated here.
- The built CLI as a binary and the engines themselves are
  [E2E](./e2e-tests.md).

## Stack

- Vitest, Node environment, `npm test` (part of `npm run ci`).
- No mocks of the filesystem, no network, no engine CLI: every
  behavior that touches files is proven on real files.

## Conventions

- Files under `tests/integration/*.test.ts`, one per command or concern.
- Content is loaded from `src/` (skills, commands, templates), not from
  `dist/`: the suite does not need a build.
- Each test works in its own `mkdtempSync` directory, removed in
  `afterEach`; nothing is written in the repository.
- `tests/fixtures/acme-billing/` is the README's example project, copied
  into a temporary git repository by the view and review tests. Its
  `gitignore.txt` becomes `.gitignore` there (a real `.gitignore` would
  apply to this repository), and `.harnessrc.json` keeps the fixtures out
  of this repository's own lint.
- A review test runs the server in-process on a free port with a 50 ms
  debounce; a test that starts one closes it in `afterEach`.
- `tests/setup/isolate-git.ts` clears the variables a git hook exports
  (`GIT_DIR`, `GIT_INDEX_FILE`…) before any test: inherited from the
  pre-commit hook, they made the tests' `git init`, `git config` and
  `git commit` write into the repository being committed, its shared
  config included.
- `tests/fixtures/legacy-0.9/manifest.json` is the unmodified output of
  harness 0.9.0 (see its README): never regenerate or hand-edit it, it
  is what makes the migration test honest.
- A fixture that activates a pillar writes a file into its folder: an
  empty pillar folder fails `lint:doc-layout`, and git would not keep it
  anyway. A project with a README alone is the baseline fixture, not a
  repo with every pillar.
- `harness-skills.test.ts` holds the release-time contracts of the two
  harness skills: a `harn-upgrade` entry for the current minor
  version, and an `add` command in `harn-guide` for every pillar that
  can be added. Bumping the version without the entry fails it.
- A safety rule (path validation, ownership, rollback) is tested by
  checking that no project file changed, not only that an error was
  thrown.

## Known gaps

- ⚠️ **`lint` through a subprocess** (spec §10.2) — linters are tested
  as functions; the exit code and output format of the CLI are not.
  Low priority: the self-application in CI runs the binary.
- ⚠️ **Overrides loaded from a real worktree** (spec §11) — only
  temporary projects are used.
- ⚠️ **Lessons from Codex and OpenCode conversations** (spec §10.5) —
  only the Claude Code history format is read and tested; the other
  two are an open question of the spec.
- ⚠️ **`harn-doc-audit` and the writer skills** (spec §10.1) — skills are
  prompts; their output needs an engine and is judged by review, not by
  the suite.
