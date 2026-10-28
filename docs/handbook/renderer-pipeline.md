---
title: Renderer pipeline
tracks:
  - src/render.ts
  - src/renderers/common.ts
  - src/renderers/claude-code.ts
  - src/renderers/codex-cli.ts
  - src/renderers/opencode.ts
  - src/renderers/index.ts
  - src/parser/schemas.ts
  - src/parser/common.ts
last_reviewed: 2026-10-27
---

# Renderer pipeline — handbook

How `*.skill.md` / `*.cmd.md` sources become each engine's native files plus `AGENTS.md` and `CLAUDE.md`. Spec: [§4](../spec/coding-agent-harness.md#4-multi-engine-composition) and [§8](../spec/coding-agent-harness.md#8-composition-umbrella--skills--commands); decisions: [pivot format](../decisions/multi-engine-pivot-format.md), [engine-native layouts](../decisions/engine-native-layouts-1-0.md).

## Start here

- [`src/render.ts`](../../src/render.ts) — `render()`, the pure orchestrator: merge, per-engine loop, root files.
- [`src/renderers/common.ts`](../../src/renderers/common.ts) — shared frontmatter helpers and `buildUmbrellaBody`, the text of every project's `AGENTS.md`.
- [`src/parser/schemas.ts`](../../src/parser/schemas.ts) — the strict Zod schemas of the two pivot formats.

## Invariants

- Parse → render is pure: `render()` never touches the disk. Writes, tracking and conflicts belong to the CLI planner ([file lifecycle](./uninstall.md)).
- Rendered output is skills, commands, `AGENTS.md` and, with claude-code only, `CLAUDE.md` as the single `@AGENTS.md` line. No agent, hook, MCP or settings file.
- Both pivot schemas are `.strict()`: an unknown frontmatter key is a parse error, so a typo fails the build instead of silently dropping a skill.
- All three engines get YAML frontmatter from one serializer; skills emit `name` (= directory name, per the Agent Skills format) and `description`, OpenCode commands only `description`.

## Traps

- OpenCode also reads `.claude/skills/` and `.agents/skills/`: `render()` processes it last and omits its own copy of a skill another rendered engine already exposes. Its **command** is still written to `.opencode/commands/`.
- Codex renders no command at all (custom prompts are deprecated): the skill is invoked by name.
- Any change to `buildUmbrellaBody` changes the committed `AGENTS.md` of every harnessed project, this repo included: run `update .` here, and expect `lint:generated-fresh` to fail downstream until they update.

## Debug

- **A command is missing** — on Codex that is expected; elsewhere its `invokes_skill` was not rendered on that engine ([capabilities matrix](./capabilities-matrix.md)).
- **An OpenCode skill file is missing** — expected when Claude Code or Codex is also rendered.
