# Each renderer emits exactly what its engine reads

- **Date:** 2026-09-20
- **Author:** Vaubaan core
- **Status:** accepted

## Context

The rendering layouts set in May 2026 were never tested against the
live CLIs. A check against the official documentation of the three
engines ([findings of 2026-09-20](../research/2026-09-20-conformite-engines-verifiee.md))
showed that most `codex-cli` and `opencode` outputs were not
discovered: Codex skills in the wrong folder, OpenCode frontmatter in
TOML instead of YAML, OpenCode skills in `plugins/`, which only loads
JS/TS. On the Claude Code side, a prose `CLAUDE.md` stub masked the
native `AGENTS.md` reading.

There is no skills folder read by all three engines: Claude Code only
reads `.claude/skills/`, Codex only `.agents/skills/`, OpenCode reads
both plus `.opencode/skills/`. The pivot format
([multi-engine-pivot-format](./multi-engine-pivot-format.md)) stays;
only its output changes.

## Decision

Each renderer emits **exactly** what its engine's docs say it reads,
and nothing else:

| | claude-code | codex-cli | opencode |
|---|---|---|---|
| Skill | `.claude/skills/<id>/SKILL.md` | `.agents/skills/<id>/SKILL.md` | `.opencode/skills/<id>/SKILL.md`, **omitted** when another rendered engine already exposes the skill |
| Skill frontmatter | YAML `name`, `description` | same | same |
| Command | `.claude/commands/<id>.md` | **none** (custom prompts deprecated; the skill is invoked by name) | `.opencode/commands/<id>.md`, YAML `description` |
| Entry point | `CLAUDE.md` containing `@AGENTS.md` | `AGENTS.md` | `AGENTS.md` |

`CLAUDE.md` is kept because versions before 2.1.277 and third-party
providers read it; its content is the import, which loads `AGENTS.md`
on every version and platform without double reading. A single YAML
frontmatter serializer serves all three engines.

Nothing else is rendered: no agent files, no engine settings, no hook,
no MCP configuration
([no-personas-no-code-judgment](./no-personas-no-code-judgment.md),
[lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md),
[no-mcp-no-code-merge](./no-mcp-no-code-merge.md)).

## Consequences

- Skills and commands are actually loaded by Codex and OpenCode.
- On Codex there are no slash commands: the skill is invoked by name.
- OpenCode's own skill copy is dropped when Claude Code or Codex is
  also rendered, which keeps the committed output small.
- If Claude Code starts reading `.agents/skills/`, rendering can
  converge to one folder.

## Rejected alternatives

- **Render once under `.agents/skills/`**: Claude Code reads nothing
  under `.agents/`.
- **Symlinks `.claude/skills → .agents/skills`**: fragile on Windows
  and in sandboxes.
- **Delete `CLAUDE.md`**: breaks versions before 2.1.277 and
  third-party providers, with no gain over the import.
- **Keep a TOML frontmatter for OpenCode**: OpenCode reads YAML; the
  TOML output of May 2026 was never loaded.
- **A prose `CLAUDE.md` redirect stub**: the pattern the Claude Code
  docs advise against once `AGENTS.md` is read natively; the import
  does the same without a second file to maintain.

## History

- 2026-05-21: the OpenCode renderer emitted TOML frontmatter (`+++`)
  and `CLAUDE.md` was a prose stub redirecting to `AGENTS.md`
  (decisions `toml-for-opencode`, `claude-md-stub-back-compat`).
- 2026-09-20: layouts verified against the live CLIs; YAML everywhere,
  Codex skills under `.agents/skills/`, `CLAUDE.md` becomes the
  `@AGENTS.md` import (1.0.0).
- 2026-10-22, c45b319: Codex agents in TOML, OpenCode agents and the
  hook files are no longer rendered.
