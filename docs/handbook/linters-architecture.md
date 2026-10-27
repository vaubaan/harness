---
title: Linters architecture
tracks:
  - src/linters/types.ts
  - src/linters/index.ts
  - src/linters/util.ts
  - src/linters/config.ts
  - src/linters/frontmatter-tracks.ts
  - src/linters/tracks-drift.ts
  - src/linters/gitignore-harness.ts
  - src/linters/generated-fresh.ts
  - src/cli/check.ts
last_reviewed: 2026-10-27
---

# Linters architecture — handbook

The mechanical linters run by `vaubaan-harness lint`, in CI and in a git pre-commit hook, never by an engine hook. Spec: [§10.2](../spec/coding-agent-harness.md#102-mechanical-linters-ci-gates); decisions: [linters vs skills](../decisions/linters-mechanical-vs-skills.md), [lint in CI and pre-commit](../decisions/lint-in-ci-and-pre-commit.md).

## Start here

- [`src/linters/index.ts`](../../src/linters/index.ts) — `ALL_LINTERS`, `runLinters`, the text report.
- [`src/linters/types.ts`](../../src/linters/types.ts) — the `Linter` contract and the versioned `LintReport`.
- [`src/linters/util.ts`](../../src/linters/util.ts) — file, frontmatter and git helpers every linter reuses.
- [`src/linters/linters.test.ts`](../../src/linters/linters.test.ts) — one temporary repo per case; the template for a new linter's test.

## Invariants

- A linter is a pure read of the repo: it never writes. Only `generated-fresh` loads the harness content (through `planInit`).
- A linter must be listed in `ALL_LINTERS` to run; exporting it is not enough. The list order is the report order.
- Only errors fail the run (`pass = errors === 0`); warnings never change the exit code. A crashing linter becomes one `<internal>` error and the others still run.
- The JSON report carries `version: 1`; changing its shape means bumping it.
- `check` and `lint:gitignore-harness` share the same gitignore lists (`missingGitignoreEntries`, `forbiddenGitignoreEntries`): change them in one place.

## Traps

- `listMarkdown` skips every `README.md`: pillar READMEs are never linted for content or `tracks:`. Use `listAllMarkdown` when a linter must see them.
- `tracks-drift` measures from the doc's last **commit**, not from `last_reviewed` (no linter reads that field), and sums commits per tracked file: one commit touching five tracked files counts five. A per-doc `driftThreshold:` raises or lowers the default of 10.
- The git helpers swallow errors: outside a git repo, or in a shallow CI clone, `tracks-drift` silently reports nothing.
- `generated-fresh` ignores `preservedFiles` and the paths 1.x released (`RELEASED_PATHS`); a file the manifest lists but no longer renders is reported as stale only if it still exists.
- `lint.ignore` in the cosmiconfig `harness` config (e.g. `package.json`) only widens the glob ignores of `cross-links` and `orphan-decisions`; it does not silence a linter.

## Debug

- **`generated-fresh` fails right after upgrading the harness** — expected: the new version renders differently. Run `update .` and commit.
- **`generated-fresh` fails on a teammate's machine only** — the committed render includes someone's local `.harness-overrides/`; team skills belong in `docs/skills/`.
