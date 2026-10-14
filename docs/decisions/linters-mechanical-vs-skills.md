# 0007 — Mechanical linters + `doc-audit` skill (two complementary layers)

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

Spec §9.3 and §10
([spec §10](../spec/coding-agent-harness.md)) define a persistent
contract over the 6 doc pillars (README + spec + decisions +
handbook + tests + workflow). Some of these rules can be strictly
mechanized (presence of a file, section schema, keyword
blocklist, link resolution). The rest requires *semantic
judgment* — does an implicit decision in a commit need
an ADR? Is the content of a handbook really representative of the
current code?

Having a mechanical linter do everything misses the nuances. Having
an LLM do everything is expensive, non-deterministic, and cannot
block a PR in CI without an LLM budget per PR.

## Decision

Two **complementary** layers, shipped together in the harness:

### Layer A — Mechanical linters (CI gates, exit code)

13 TypeScript linters under `src/linters/`, accessible via
`npx -y @vaubaan/harness lint` (aggregated exit code):

`lint:readme-presence`, `lint:readme-sections`, `lint:doc-layout`,
`lint:cardinal-files`, `lint:decision-schema`,
`lint:frontmatter-tracks`, `lint:tracks-drift`,
`lint:spec-tech-agnostic`, `lint:cross-links`,
`lint:orphan-decisions`, `lint:gitignore-harness`.

Each is a pure function `(repoRoot) → LintIssue[]`. Severities
`error` / `warning`. Runnable in CI without an LLM budget. Text or
JSON output (`--format=json`).

### Layer B — `doc-audit` skill (semantic, LLM-driven)

Canonical skill `doc-audit.skill.md` invoked by the `review`
and `planning` agents, or by a human via `/doc-audit`. Produces a report
on:

- implicit decisions in `git log` that have not been turned into ADRs,
- semantic coverage of the spec vs actual subsystems,
- subtle spec / handbook boundary drift,
- semantic freshness of a handbook (not just an mtime),
- recommendations for moving / refactoring docs.

### Golden rule

> Any check that can be written as a regex / AST parser *must* become a
> linter (and therefore a CI gate). The skill keeps only the checks
> that require judgment.

## Consequences

- **Mechanical in CI**: no mechanically detectable drift can
  be merged. The `lint:decision-schema` linter, for example, validates that this
  ADR contains the 4 required sections — it recursively validates the
  files in this folder.
- **Semantic in session**: `doc-audit` runs when the agent needs it
  (review, planning), not on every PR.
- **No silent double maintenance**: spec §10.3 explicitly lists
  the division of labor between the two layers.
- **CI cost ≈ 0**: the TypeScript linters run in a few
  seconds, without network calls.

## Rejected alternatives

- **All LLM**: slow, non-deterministic, costly per PR; blocking a
  merge on an LLM call is a UX and reliability regression.
- **All mechanical linters**: misses the nuances that make the real
  value of the doc audit (implicit decisions, subtle drift).
- **Linters built *into* the `doc-audit` skill**: then there is no CI
  gate without LLM cost; we lose automatic enforcement.
- **External linters (third-party library)**: none knows the
  harness's 6-pillar convention; integration cost > writing cost.
- **Trust humans and drop the gates**: precisely what
  the harness fights against (see spec §1, the promise of keeping docs maintained).

See [ADR _yaml-frontmatter-zod-strict_](./yaml-frontmatter-zod-strict.md) for the
general "fail fast on what can be mechanized" philosophy.
