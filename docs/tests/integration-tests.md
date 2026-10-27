---
title: Integration test plan
tracks:
  - vitest.config.ts
  - tests/integration/**/*.ts
  - tests/fixtures/legacy-0.9/manifest.json
last_reviewed: 2026-10-27
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
- `tests/fixtures/legacy-0.9/manifest.json` is the unmodified output of
  harness 0.9.0 (see its README): never regenerate or hand-edit it, it
  is what makes the migration test honest.
- A safety rule (path validation, ownership, rollback) is tested by
  checking that no project file changed, not only that an error was
  thrown.

## Known gaps

- ⚠️ **`lint` through a subprocess** (spec §10.2) — linters are tested
  as functions; the exit code and output format of the CLI are not.
  Low priority: the self-application in CI runs the binary.
- ⚠️ **Overrides loaded from a real worktree** (spec §11) — only
  temporary projects are used.
- ⚠️ **`doc-audit` and the writer skills** (spec §10.1) — skills are
  prompts; their output needs an engine and is judged by review, not by
  the suite.
