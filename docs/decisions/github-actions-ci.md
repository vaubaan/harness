# GitHub Actions CI on PRs and `main`

**Date:** 2026-06-06
**Status:** accepted
**Author:** Vaubaan core

## Context

Before PR #9 the only workflow was `publish.yml`, triggered on version
tags. Nothing ran on pull requests or on pushes to `main`, and PRs had
been merged with lint violations. The quality of the trunk rested on
human discipline, not on a technical mechanism.

## Decision

`.github/workflows/ci.yml` runs on every push to `main` and every pull
request targeting it. One `ci` job runs `npm run ci`: typecheck, lint,
tests, build, then the harness's own linters on this repository
(`lint:harness`). `publish.yml` runs the same `npm run ci` before
publishing, so the PR gate and the release gate are the same command.

This is the only mechanical gate of the project. Locally, the husky
pre-commit hook runs the same command
([lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md)); it is a
convenience, not a substitute: forks, containers and direct pushes do
not have it.

## Consequences

- No PR reaches `main` without passing the full suite; the first catch
  was a lint violation in PR #11.
- One job, one log ordered by step. The suite runs in about twenty
  seconds, so splitting it into parallel jobs would buy nothing.
- The job runs on `ubuntu-latest`; a check that passes on macOS and
  fails on Linux (native dependencies, case-sensitive paths) shows up
  only in CI.
- `npm run ci` is sequential: an early failure hides later ones until
  the next push.

## Rejected alternatives

1. **Separate jobs per step**: more granular badges, more YAML, and a
   less readable diagnosis for a suite this fast.
2. **Pre-commit hooks only**: they block local commits but not
   environments without the hook. The two mechanisms are
   complementary, not interchangeable.
3. **No CI, rely on `publish.yml`**: it runs at release time only and
   leaves the development loop without a safeguard.

## History

- 2026-06-03, squash ba3657f: PR #1 merged, adding ten unit tests for
  `formatReportText`, before any CI existed (decision
  `test-format-report-text-merge`).
- 2026-06-06: `ci.yml` added (PR #9).
- 2026-09-20: the 1.0.1 safety patch released by squash-merging PR #51
  after CI, then tagging `v1.0.1` on `main` (decision
  `release-safety-patch-1-0-1`).
- 2026-10-22, c45b319: CI becomes the only mechanical gate; the
  in-session Stop hook it used to complement is removed.
