# 0005 — Capabilities matrix with degraded mode

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

The three target engines support roughly the same
features, but with nuances that matter
(see [spec §4.2](../spec/coding-agent-harness.md)):

| Feature                  | claude-code | codex-cli | opencode |
|--------------------------|:-----------:|:---------:|:--------:|
| Slash command            |     ✅      |    ✅     |    ✅    |
| Skill auto-load          |     ✅      |    ✅     |    ✅    |
| Multi-step (subagent)    |     ✅      |    ⚠️*    |    ✅    |
| Inline code execution    |     ✅      |    ✅     |    ✅    |

Codex-cli supports `multi-step` *but* with a documented
degradation — the behavior is present, the integration less rich than on the
other two engines. We want this nuance to be explicit both
at render time (skip vs warning) and in the rendered output (the agent
knows it is operating in degraded mode).

A source skill declares its `requires` in its frontmatter (e.g.
`requires: [multi-step]`). The renderer must decide what to do for
each (skill, engine) combination.

## Decision

Two structures side by side in `src/types.ts`:

- `CAPABILITIES_MATRIX: Record<Engine, ReadonlyArray<Capability>>` —
  capabilities **supported** by each engine. Source of truth.
- `DEGRADED_CAPABILITIES: Partial<Record<Engine, ReadonlyArray<Capability>>>` —
  subset that is supported **in degraded mode** (informational warning
  at render time).

Renderer policy (see `src/renderers/common.ts`):

| Case                                          | Renderer action                                            |
|-----------------------------------------------|------------------------------------------------------------|
| Skill requires a cap not listed for the engine | **Skip** the skill + blocking warning (the skill is not rendered) |
| Skill requires a cap listed as degraded       | **Render** the skill + informational warning in `audit.log` |
| Skill requires only full caps                 | Render normally                                            |

The `engineSupports(engine, cap)` helper lets renderers and
linters ask the question without knowing the internal structure.

## Consequences

- **Information preserved**: on codex-cli, a `multi-step` skill is
  rendered with an explicit warning rather than silently skipped
  or silently assumed to be full-featured.
- **Simple evolution**: promoting a capability from degraded to full
  for an engine = removing an entry in `DEGRADED_CAPABILITIES`.
- **Testability**: the policy is pure, testable with a table
  of inputs (skill × engine × cap) → expected result.
- **Linters**: a future linter could check that no skill
  requires a cap that no engine supports (dead capability).

## Rejected alternatives

- **Hard skip everywhere as soon as a cap is missing**: loses skills on
  codex-cli where they are actually usable (degraded quality but
  useful).
- **Render blindly without flagging the degradation**: the agent does not know
  it is operating in degraded mode, and we lose traceability in
  `audit.log`.
- **A single boolean `supported` level per cap**: not expressive enough
  for the codex-cli `multi-step` case.
- **Tag the degradation directly in the skill's
  frontmatter**: moves the knowledge "which engine is degraded on which
  cap" into each source — combinatorial explosion and guaranteed drift.
- **Three or more levels (full / partial / minimal / none)**:
  oversized for v1, we have only one identified degraded case.

See [ADR _multi-engine-pivot-format_](./multi-engine-pivot-format.md) for the role of
renderers; [ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md) for
CI gates.
