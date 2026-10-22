# Multi-engine pivot format

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

The harness targets three coding agent engines, `claude-code`,
`codex-cli` and `opencode`, each with its own native filesystem layout
and frontmatter conventions
([engine-native-layouts-1-0](./engine-native-layouts-1-0.md)). We want
one set of doc skills that works identically on all three, without
duplicating the content or building a heavy abstraction.

## Decision

A single **pivot format** per artifact type:

- `*.skill.md`, the source of every skill (spec §5);
- `*.cmd.md`, the source of every slash command (spec §6).

Three pure **per-engine renderers** (`src/renderers/claude-code.ts`,
`codex-cli.ts`, `opencode.ts`) transform the pivot into the engine's
native layout. Rendering is a pure function `(skill, engine) →
RenderedFile[]`: no I/O, no state, idempotent.

The pivot is Markdown with YAML frontmatter, readable and editable by
hand. No templating engine sits in between.

## Consequences

- One skill is one file in the package. Cross-engine differences live
  in the frontmatter (`engines:`, `requires:`) and in the renderers,
  not in duplicated copies.
- Adding an engine is writing a fourth renderer; no source file
  changes.
- The same pivot can be skipped or rendered in degraded mode per engine
  through the capabilities matrix
  ([capabilities-matrix-with-degradation](./capabilities-matrix-with-degradation.md)).

## Rejected alternatives

- **Separate sources per engine**: N× duplication, inevitable drift.
- **A templating engine on the source**: needless runtime complexity; a
  skill's body is a prompt, not a template.
- **One common layout imposed on all three engines**: each engine has
  its own loader scanning its own folder.
- **Convert on the fly inside the agent**: moves the problem into the
  engine and breaks the idempotence of `init`.

## History

- 2026-05-21: decided with three pivot types, `*.agent.md` included,
  and a YAML to TOML conversion for OpenCode.
- 2026-09-20: TOML output dropped, OpenCode reads YAML (1.0.0).
- 2026-10-22, c45b319: `*.agent.md` and `renderAgents` removed
  ([no-personas-no-code-judgment](./no-personas-no-code-judgment.md)).
