---
title: Mechanical linters gate, the doc-audit skill judges
status: accepted
date: 2026-05-21
author: Vaubaan core
---

# Mechanical linters gate, the `doc-audit` skill judges

## Context

Part of the doc contract ([spec §9.3](../spec/coding-agent-harness.md))
is strictly mechanical: file presence, section schema, keyword
blocklist, link resolution, freshness of a generated file. The rest needs
judgment: does a commit hide a decision, does a handbook still match the
code. An LLM doing the first kind is slow, non-deterministic and cannot
block a PR without a per-PR budget.

## Decision

Any check that can be written as a regex, a parser or a file comparison
is a deterministic linter, run by `vaubaan-harness lint` in CI and
pre-commit with an exit code. The `doc-audit` skill keeps only the checks
that require judgment, and never gates a merge.

## Consequences

- A check moving from the skill to a linter is a visible change of the
  division of labor in [spec §10.3](../spec/coding-agent-harness.md).
- Linters stay pure functions of the repository: no LLM, no network.
- Compacting or moving doc content is skill work, reviewed by a human.

## Rejected alternatives

### All LLM
Slow, non-deterministic and costly per PR; blocking a merge on an LLM call
is a reliability regression.

### All mechanical
Misses implicit decisions and semantic drift, what makes the audit useful.

### Third-party doc linters
None knows the pillar convention; integrating them costs more than writing
the checks.
