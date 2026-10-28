---
title: One pivot source per skill, one pure renderer per engine
status: accepted
date: 2026-05-21
author: Vaubaan core
---

# One pivot source per skill, one pure renderer per engine

## Context

The harness targets three engines with different native layouts and
frontmatter conventions
([engine-native-layouts-1-0](./engine-native-layouts-1-0.md)). The same
doc skills must behave identically on all three without duplicating
their content.

## Decision

Each skill and each command has a single source, `*.skill.md` or
`*.cmd.md`: Markdown with a strict YAML frontmatter, no templating in the
body. One renderer per engine turns it into the engine's layout as a pure
function `(source, engine) → files`.

## Consequences

- Cross-engine differences live in the frontmatter (`engines:`,
  `requires:`) and in the renderers, never in per-engine copies of a skill.
- Adding an engine means writing a renderer; no source changes.
- Which engine supports which capability is declared once in the package,
  not in each skill ([spec §4.2](../spec/coding-agent-harness.md)).

## Rejected alternatives

### Separate sources per engine
N× duplication and inevitable drift.

### A templating engine on the source
A skill body is a prompt, not a template; conditionals in it would make
every source harder to read and test.

### Convert inside the agent at load time
Moves the problem into the engine and breaks the idempotence of `init`.
