# Mechanical linters and the `doc-audit` skill, two complementary layers

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

The [spec](../spec/coding-agent-harness.md) (§9.3, §10) defines a
persistent contract over the doc pillars. Some of its rules can be
strictly mechanized: presence of a file, section schema, keyword
blocklist, link resolution, freshness of a generated file. The rest
requires judgment: does an implicit decision in a commit need an ADR?
Does a handbook still describe the code it points to?

A mechanical linter cannot do the second kind. An LLM doing the first
kind is expensive, non-deterministic, and cannot block a PR without an
LLM budget per PR.

## Decision

Two complementary layers, shipped together.

**Layer A, mechanical linters.** TypeScript linters under
`src/linters/`, 15 in 2.0, run by `npx @vaubaan/harness lint` with an
aggregated exit code. Each is a pure function `(repoRoot) → LintIssue[]`
with a severity, runnable in CI and in a pre-commit hook without any
LLM, with text or JSON output.

**Layer B, the `doc-audit` skill.** Invoked by the agent or by a human
via `/doc-audit`. It reports implicit decisions not turned into ADRs,
semantic coverage of the spec, pillar boundary drift, the real
freshness of a handbook, and what to move or rewrite.

**Golden rule:** any check that can be written as a regex, an AST
parser or a file comparison *must* become a linter, and therefore a CI
gate. The skill keeps only the checks that require judgment.

## Consequences

- No mechanically detectable drift can be merged; the semantic audit
  runs when the agent needs it, not on every PR.
- The division of labor is written in spec §10.3; a check that moves
  from the skill to a linter is a visible change there.
- CI cost is a few seconds, without network calls.
- Compacting a pillar, folding stacked reversals into current state
  ([decisions-as-current-state](./decisions-as-current-state.md)), is
  layer B work: `doc-audit` finds the trigger, the rewrite is reviewed.

## Rejected alternatives

- **All LLM**: slow, non-deterministic, costly per PR; blocking a merge
  on an LLM call is a reliability regression.
- **All mechanical**: misses what makes the audit valuable, implicit
  decisions and subtle drift.
- **Linters built into the skill**: no CI gate without LLM cost.
- **Third-party doc linters**: none knows the pillar convention;
  integration costs more than writing.
- **Trust humans and drop the gates**: what the harness exists to fix.

See [yaml-frontmatter-zod-strict](./yaml-frontmatter-zod-strict.md) for
the same "fail fast on what can be mechanized" stance at parse time.

## History

- 2026-05-21: 13 linters.
- 2026-10-13: `lint:quality-schema` added (14).
- 2026-10-22, c45b319: `lint:generated-fresh` added (15); the Stop hook
  that used to run the linters at end of turn is gone, CI and
  pre-commit run them.
