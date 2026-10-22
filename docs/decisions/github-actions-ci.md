# GitHub Actions CI on PRs and `main`

**Date:** 2026-06-06
**Status:** accepted
**Author:** Vaubaan core

> **Amended (2026-10-22)** by
> [lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md): the
> in-session Stop hook mentioned below is removed. CI is the only
> mechanical gate, with an optional git pre-commit hook in the project.

## Context

Before PR #9, the repo's only GitHub Actions workflow was `publish.yml`,
triggered only on version tags. No workflow ran
on PRs or on pushes to `main`.

Direct consequence: PRs were merged without any automated
check. The repo history contains PRs merged with lint
violations (e.g. PR #11: `lint/style/useTemplate` — string concatenation
instead of a template literal). Without an automatic gate,
detection relied on humans during review, which is costly and
not systematic.

Risk: typecheck regressions, lint violations, test or build
failures could land on `main` without ever being blocked.
The quality of the main trunk was guaranteed only by human discipline,
not by a technical mechanism.

The in-session Stop hook (see
[ADR _stop-hook-lint-loop_](./stop-hook-lint-loop.md)) covers local agent
sessions, but it does not apply to human PRs or to
environments where the hook is not installed (CI containers, direct API
pushes). A second safety net, at the branch level, was needed.

## Decision

Add `.github/workflows/ci.yml`, triggered on:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

The workflow defines a single `ci` job that runs `npm run ci`. This
command runs, in order: `typecheck → lint → test → build →
lint:harness`. A single job is enough because `npm run ci` already provides
readable step-by-step output, and the full test suite runs in
~20 seconds — the extra granularity of multiple jobs brings no
measurable benefit.

The `publish.yml` workflow (tag-triggered) is unchanged; it also
runs `npm run ci` before publishing, making the gate consistent between the
PR cycle and the release cycle.

## Consequences

**Benefits**:

- Every PR targeting `main` must pass CI before it can be merged. The gate
  is technical, not human.
- First concrete catch: PR #11 had a
  `lint/style/useTemplate` violation (string concatenation) detected and blocked
  before merge. PRs #10 to #14 were all gated by this workflow.
- Consistency between the PR gate and the release gate is guaranteed: both
  run the same `npm run ci`, eliminating possible divergences between
  "what passes in dev" and "what passes at publish".
- No extra configuration on the consumer side — the workflow lives in the
  harness repo itself, not in the consumer project.

**To accept**:

- The workflow runs on GitHub-provided `ubuntu-latest`. If a check
  passes locally (macOS) but fails in Linux CI (native dependencies,
  case-sensitive paths), the cause is not always immediate to
  diagnose.
- `npm run ci` is sequential: an early failure (typecheck) blocks the
  following steps. Acceptable for a fast suite, but with
  multiple independent categories of errors, the human has to fix and
  push again several times.

## Rejected alternatives

1. **Separate jobs per step** (typecheck, lint, test, build, lint:harness
   as 5 parallel jobs): provides more granular GitHub UI feedback
   (one badge per job), but adds complexity to the workflow YAML and makes
   diagnosis less readable — `npm run ci` already produces output
   ordered by step in a single log. Since the suite runs in ~20s,
   the parallelism gain is negligible.

2. **Pre-commit hooks only** (already in place via husky): they block
   the human's local commits, but do not cover CI-hostile
   environments (containers, direct API pushes, forks without hooks installed).
   Insufficient as a merge gate — the two mechanisms are
   complementary, not interchangeable.

3. **No CI — rely on `publish.yml` only**: `publish.yml`
   only runs at release time, not on every PR. It leaves the
   development loop without a safeguard between two releases. Documented
   risk: PRs with lint violations had already been merged before this
   workflow.

## References

- [ADR _stop-hook-lint-loop_](./stop-hook-lint-loop.md) — the Stop hook
  covers the in-session agent loop; this CI workflow extends the same safety net
  to human PRs and to environments without the hook.
- [Spec `coding-agent-harness`](../spec/coding-agent-harness.md) — §10
  sets out the project's quality philosophy (systematic mechanical linters,
  CI gates), of which this workflow is a direct expression.
