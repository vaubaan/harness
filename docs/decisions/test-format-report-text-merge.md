---
date: 2026-06-03
status: accepted
---

# Merge PR #1 — test(linters): add unit tests for formatReportText

## Context

`formatReportText(report: LintReport): string` is the main output of the lint pipeline, read by agents at stop-hook time. Despite its critical role, the function had no direct test. PR #1 adds a complete `describe("formatReportText", ...)` in `src/linters/linters.test.ts` (10 cases, 116 lines) covering all code paths.

## Decision

Squash merge of PR #1 (`feature/test-format-report-text` → `main`).

- PR: #1 (historical repository)
- Head SHA: `1c20ca48b6e603eb5d100e2c440a41bb33a8bde0`
- Base SHA: `e6b7971b762e917d4a41ce2e93073f07767d05ea`
- 148 tests pass (14 test files, 148 assertions).
- No production code change.

## Consequences

- `formatReportText` goes from 0 to 10 direct tests.
- The total test count goes from 138 to 148 (+10 new cases).
- No npm publication triggered (the `publish.yml` workflow only triggers on `v*` tags).

## Rejected alternatives

- **No tests**: rejected — critical function without direct coverage.
- **Tests in a separate file**: rejected — `linters.test.ts` is the natural place to test the exports of `src/linters/`.

## Execution note

This note describes the infrastructure used in June 2026. CAR was
[removed on 2026-09-20](./retire-coding-agent-runner-coupling.md); the
historical token name below is not a configuration instruction.

The merge was done as a local squash commit (`ba3657f`) with a Biome formatting fix (line too long, detected by the pre-commit hook), then pushed to `main` after fixing the merge token's permissions.
