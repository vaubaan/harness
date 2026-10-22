# Verified native layouts per engine (1.0.0)

- **Date:** 2026-09-20
- **Author:** Vaubaan core
- **Status:** accepted
- **Supersedes:** [toml-for-opencode](./toml-for-opencode.md), [claude-md-stub-back-compat](./claude-md-stub-back-compat.md)

> **Amended (2026-10-22)** by
> [no-personas-no-code-judgment](./no-personas-no-code-judgment.md) and
> [lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md): Codex
> agents in TOML, OpenCode agents and the hook files are no longer
> rendered. The skill, command and `AGENTS.md` layouts below stand.

## Context

The rendering layouts in [spec §4.3](../spec/coding-agent-harness.md)
were set in May 2026 without testing against the live CLIs. A
check against the official documentation of the three engines
([findings of 2026-09-20](../research/2026-09-20-conformite-engines-verifiee.md))
shows that the `codex-cli` and `opencode` outputs are largely
**not discovered** by their engine: Codex skills in the wrong place,
Codex agents in Markdown instead of TOML, OpenCode frontmatter in TOML instead
of YAML, OpenCode skills in `plugins/` (which only loads
JS/TS), OpenCode MCP in a file that is not read, incomplete Codex hook
schema. On the Claude Code side, the "in words" `CLAUDE.md` stub is the
pattern the docs advise against since `AGENTS.md` is read natively
(2.1.277).

In parallel, a common foundation has emerged (`AGENTS.md`, `SKILL.md`, MCP,
hooks), but there is **no skills folder read by all three
engines**: Claude Code only reads `.claude/skills/`, Codex only
`.agents/skills/`. The pivot format
([multi-engine-pivot-format](./multi-engine-pivot-format.md)) therefore remains
necessary; only its output changes.

## Decision

Each renderer emits **exactly** what its engine's docs say it
reads, and nothing else:

| | claude-code | codex-cli | opencode |
|---|---|---|---|
| Skill | `.claude/skills/<id>/SKILL.md` | `.agents/skills/<id>/SKILL.md` | `.opencode/skills/<id>/SKILL.md`, **omitted** if another rendered engine already exposes the skill (OpenCode also reads `.claude/skills/` and `.agents/skills/`) |
| Skill frontmatter | YAML `name`, `description` | same | same |
| Agent | `.claude/agents/<id>.md` YAML | `.codex/agents/<id>.toml` (`name`, `description`, `developer_instructions`) | `.opencode/agents/<id>.md` YAML (`description`, `mode: all`) |
| Command | `.claude/commands/<id>.md` | **none** (custom prompts deprecated; the skill is invoked directly) | `.opencode/commands/<id>.md` YAML (`description`) |
| MCP | `.mcp.json` | `.codex/config.toml` | `.opencode/opencode.json` |
| End-of-turn hook | `.claude/settings.json` | `.codex/hooks.json` with the `hooks: [...]` level | `.opencode/plugins/harness-stop-hook.ts`, `session.idle` event, re-injection via `client.session.prompt` |

`CLAUDE.md` is kept but its content becomes the `@AGENTS.md` import.
It actually loads `AGENTS.md` on all versions and platforms
(Bedrock, Vertex, telemetry disabled), without double reading.

Rendered personas no longer carry the "Available skills" /
"Available commands" sections nor `§` references to the harness spec: the engines
discover skills natively, and the agent cannot read that spec.
`AGENTS.md` keeps a single compact list.

The **four personas are still rendered** on every engine
([multi-agent-multi-engine-default](./multi-agent-multi-engine-default.md)
unchanged). `.agents/` joins the required `.gitignore` entries.

## Consequences

**Positive:**

- Skills, agents and hooks are actually loaded by Codex and OpenCode.
- Less context consumed per persona; `AGENTS.md` remains the table of contents.
- A single frontmatter serializer (YAML); the TOML helper is now only used for Codex (`config.toml`, agents).

**Negative:**

- Layout break for projects rendered with 0.9.x. Mitigated: `init` now deletes files from the previous manifest that it no longer renders (`.codex/skills/`, `.codex/commands/`, `.opencode/plugins/<skill>/`, `.opencode/mcp.json`).
- Consumers' `.gitignore` must gain `.agents/` (otherwise `lint:gitignore-harness` fails).
- On Codex, no more `/decision` etc. slash commands: invocation by skill name.

**Neutral / to watch:**

- The OpenCode plugin relies on `session.idle` + `client.session.prompt`; OpenCode's plugin API moves fast. Covered by the `HARNESS_LINT_DISABLE=1` kill switch.
- If Claude Code starts reading `.agents/skills/`, rendering can converge to a single folder.

## Rejected alternatives

- **Render only once under `.agents/skills/`** (axis 2 of the research survey): Claude Code reads nothing under `.agents/`.
- **Symlinks `.claude/skills → .agents/skills`**: fragile on Windows and in sandboxes, and the output is already gitignored so the duplication costs nothing.
- **Delete `CLAUDE.md`**: breaks versions < 2.1.277 and third-party providers with no gain over the import.
- **Replace the persona pipeline with a native workflow, distribute as a plugin** (axes 5 and 6): a product change, not a conformance fix; to be specified separately, outside 1.0.0.
