# 0003 — YAML frontmatter validated by Zod in `strict()` mode

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

Every source `*.skill.md`, `*.cmd.md` and `*.agent.md` carries a
YAML frontmatter that declares structural fields: `id`,
`description`, `engines`, `requires`, `tags`, `trigger`,
`invokes_skill`, `args`, … (see [spec §5 and §6](../spec/coding-agent-harness.md)).
These fields drive persona choice, per-engine selection, and the
capabilities matrix.

A typo in the frontmatter (`engine: claude-code` in the singular instead
of `engines:`, or `descriptio:`) would raise no error if we only did
a permissive parse — the skill would simply be ignored at
composition, silently. That is exactly the drift we claim to
prevent.

## Decision

- **Parsing**: `gray-matter` extracts `meta` + `body` from the
  Markdown — the standard choice, robust on all delimiters.
- **Validation**: one Zod schema per artifact type
  (`SkillMetaSchema`, `CmdMetaSchema`, `AgentMetaSchema`) in
  `.strict()` mode — any field not declared in the schema makes the
  parse fail with a precise message (`Unrecognized key(s) in object: "descriptio"`).
- **Fatal error at parse time**: we do not load a skill whose
  frontmatter does not validate. The renderer only receives already
  typed objects.
- **Shared enumerations**: the finite lists (`Engine`,
  `AgentId`, `Capability`) come from `src/types.ts` and are
  reused by Zod via `z.enum(ENGINES)`.

## Consequences

- **No silent drift**: a typo'd field breaks the harness build,
  not a live session.
- **Source of truth for fields**: the Zod schemas are the executable doc
  of the pivot format.
- **Safe refactoring**: renaming a field in the schema breaks
  every source that uses the old name — visible as early as `ci`.
- **Cost**: one Zod schema per type (~30 lines each), a Zod
  dependency already pulled in by other Vaubaan subsystems.

## Rejected alternatives

- **No validation, permissive parse**: silent drift is
  precisely what the harness's linter philosophy fights
  (see [ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md)).
- **JSON Schema**: verbose to write, no native TypeScript inference,
  more painful integration with shared enums.
- **TOML everywhere instead of YAML**: YAML frontmatter is the Markdown
  standard recognized by every editor (opencode is the exception,
  handled by [ADR _toml-for-opencode_](./toml-for-opencode.md)).
- **Optional or opt-in `.strict()`**: inconsistent, we lose the guarantee
  on files that forget the opt-in.
- **Validation at runtime in the target engine**: too late, we
  want the error at harness build time, not at invocation
  by the engine.
