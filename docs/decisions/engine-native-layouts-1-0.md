---
title: Each renderer emits exactly what its engine reads
status: accepted
date: 2026-09-20
author: Vaubaan core
---

# Each renderer emits exactly what its engine reads

## Context

The three engines read skills from different folders and none is read by
all three: Claude Code reads `.claude/skills/`, Codex `.agents/skills/`,
OpenCode both plus `.opencode/skills/`. Layouts guessed without checking
the engines' documentation were silently ignored (Codex skills in the
wrong folder, OpenCode frontmatter in TOML).

## Decision

Each renderer emits only the paths and formats its engine's documentation
says it reads (table in [spec §4.3](../spec/coding-agent-harness.md)):
YAML frontmatter everywhere, no command files for Codex, an OpenCode skill
copy only when no other rendered engine exposes the skill, and `CLAUDE.md`
reduced to the `@AGENTS.md` import. Nothing else is rendered.

## Consequences

- A new engine or an engine release that changes its folders is checked
  against that engine's documentation before the renderer changes.
- Rendering converges to one folder only if every rendered engine reads it.
- Agent files, engine settings, hooks and MCP files stay out of the render
  ([lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md),
  [safe-init](./safe-init.md)).

## Rejected alternatives

### Render once under `.agents/skills/`
Claude Code reads nothing under `.agents/`.

### Symlinks between the engine folders
Fragile on Windows and in sandboxes, and refused by the path validation
of [spec §12](../spec/coding-agent-harness.md).

### A prose `CLAUDE.md` redirect, or no `CLAUDE.md`
A stub is a second file to maintain; dropping it breaks older Claude Code
versions and third-party providers. The import loads `AGENTS.md` on all.
