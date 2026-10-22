# 0001 — Multi-engine pivot format

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

> **Amended (2026-10-22)** by
> [no-personas-no-code-judgment](./no-personas-no-code-judgment.md): the
> `*.agent.md` pivot format and `renderAgents` are gone. The pivot now
> covers `*.skill.md` and `*.cmd.md`; the per-engine renderers stand.

## Context

The harness targets three coding agent engines — `claude-code`,
`codex-cli`, `opencode` — each with its own distinct native filesystem
layout (see [spec §4.3](../spec/coding-agent-harness.md)):

- `claude-code`: `~/.claude/skills/<id>/SKILL.md`, YAML frontmatter.
- `codex-cli`: `~/.codex/skills/<id>.md`, YAML frontmatter.
- `opencode`: `~/.opencode/plugins/<id>/index.md`, TOML frontmatter.

We want to ship a single set of doc-skills (`doc-audit`, `spec-writer`,
`decision-record-writer`, …) that works identically on all three
engines, without duplicating the content N times and without building a
heavy abstraction.

## Decision

A single **pivot format** per artifact type:

- `*.skill.md` — source of every skill (see [spec §5](../spec/coding-agent-harness.md)).
- `*.cmd.md` — source of every slash command (see spec §6).
- `*.agent.md` — source of the main system prompt (see spec §7.1).

Three pure **per-engine renderers** (`src/renderers/claude-code.ts`,
`codex-cli.ts`, `opencode.ts`) transform the pivot into the engine's native
layout. Rendering is a pure function
`(skill, engine) → RenderedFile[]` — no I/O, no state, idempotent.

The pivot is Markdown + YAML frontmatter, readable and editable by
hand by a human. No templating engine sits in between.

## Consequences

- **Single source**: one skill = one `*.skill.md` file in the
  package. Cross-engine differences are handled by the frontmatter
  (`engines:`, `requires:`) and by the renderers' code, not by
  duplication.
- **Adding an engine** = writing a fourth renderer (~100 lines).
  No source file needs to be touched.
- **Capabilities**: the same pivot can be skipped or rendered in degraded
  mode depending on the engine, via the matrix
  (see [ADR _capabilities-matrix-with-degradation_](./capabilities-matrix-with-degradation.md)).
- **Frontmatter conversion**: YAML → TOML for opencode is handled
  by the renderer (see [ADR _toml-for-opencode_](./toml-for-opencode.md)).

## Rejected alternatives

- **Separate sources per engine** (`skills/claude-code/`,
  `skills/codex-cli/`, …): N× duplication, inevitable drift between
  copies of the same skill.
- **Handlebars / Jinja-style templating engine on the source**:
  needless runtime complexity; a skill's body is a *prompt*, not
  a *template* — no conditional logic in the content
  (see spec §5, writing rules).
- **A single common layout imposed on all three engines**: unrealistic,
  each engine has its native loader that scans its own folder.
- **Convert on the fly at runtime inside the agent**: moves the
  problem into the target engine, breaks the idempotence of `init`.
