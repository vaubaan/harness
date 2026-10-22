---
tracks:
  - src/types.ts
  - src/renderers/common.ts
  - src/renderers/claude-code.ts
  - src/renderers/codex-cli.ts
  - src/renderers/opencode.ts
  - src/parser/schemas.ts
last_reviewed: 2026-10-22
---

# Capabilities matrix

How the harness decides that a skill is compatible with an engine — and
what happens when it is only half compatible.

## Overview

Three capabilities are declared in `src/types.ts`:

```ts
export const CAPABILITIES = ["multi-step", "slash-command", "inline-exec"] as const;
```

- `multi-step` — ability to chain several coherent steps
- `slash-command` — commands invoked via `/foo`
- `inline-exec` — inline execution of code/tools

A skill *may* declare `requires: [...]` in its frontmatter
(`SkillFrontmatterSchema`, `src/parser/schemas.ts`). If it does not,
it is assumed to work everywhere.

## The matrix

Two tables, in `src/types.ts`:

```ts
export const CAPABILITIES_MATRIX: Record<Engine, ReadonlyArray<Capability>> = {
  "claude-code": ["multi-step", "slash-command", "inline-exec"],
  "codex-cli":   ["multi-step", "slash-command", "inline-exec"],
  opencode:      ["multi-step", "slash-command", "inline-exec"],
};

export const DEGRADED_CAPABILITIES: Partial<Record<Engine, ReadonlyArray<Capability>>> = {
  "codex-cli": ["multi-step"],
};
```

- `CAPABILITIES_MATRIX[engine]` — capabilities **supported** by this engine.
  A capability outside this list = blocking.
- `DEGRADED_CAPABILITIES[engine]` — capabilities supported **but degraded**.
  The skill runs; a warning is just emitted.

Today: all engines declare all three capabilities. Only
`codex-cli + multi-step` is marked as degraded — multi-step remains
less smooth there than in claude-code (see spec §4.2).

Simple boolean helper: `engineSupports(engine, capability)`
(`src/types.ts`).

## The check at render time

All the decision logic lives in `checkSkillCapabilities`
(`src/renderers/common.ts`):

```ts
for (const cap of skill.meta.requires) {
  if (!supported.includes(cap as Capability)) {
    blockingWarnings.push(`skill "${skill.meta.id}" requires "${cap}" not supported by "${engine}" — skipped`);
  } else if (degraded.includes(cap as Capability)) {
    degradedWarnings.push(`skill "${skill.meta.id}" requires "${cap}" — supported by "${engine}" with degradation`);
  }
}
```

Two distinct buckets:

- **`blockingWarnings`** — the skill is *skipped*. The renderers return
  `{ files: [], warnings: blockingWarnings }` (see `src/renderers/claude-code.ts`,
  `src/renderers/codex-cli.ts`, `src/renderers/opencode.ts`).
  The `render()` orchestrator sees `files.length === 0` and does not add the
  skill to `renderedSkillIds` (`src/render.ts`). Cascade: any cmd that
  pointed to this skill via `invokes_skill` is also dropped
  (`src/render.ts`).
- **`degradedWarnings`** — the skill is rendered normally, but the warning
  is surfaced in `RenderResult.warnings`. The CLI prints them on stderr
  (`src/cli/index.ts`) without blocking the command.

## Concrete example

A skill with `requires: [multi-step]`:

```yaml
---
id: my-multi-step-skill
description: chains 5 sub-tasks
requires: [multi-step]
---
```

| Engine        | Result                                                                  |
|---------------|-------------------------------------------------------------------------|
| `claude-code` | rendered, **no** warning (`multi-step` supported and not degraded)      |
| `codex-cli`   | rendered, **degradation warning** (`multi-step` listed in `DEGRADED_CAPABILITIES`) |
| `opencode`    | rendered, no warning                                                    |

Conversely, a hypothetical `requires: [vision]` (nonexistent capability)
would be rejected by Zod at parse time — `requires` is typed `z.enum(CAPABILITIES)`
(`src/parser/schemas.ts`). So an undeclared capability can never
reach the check; you will never hit `blockingWarnings` unless
you add a new capability and then remove it from an engine's
`CAPABILITIES_MATRIX`.

## Explicit engines

Independently of `requires`, a skill can whitelist engines via
`engines: [...]` in its frontmatter. The `isSkillEngineAllowed` check
(`src/renderers/common.ts`) short-circuits before the capability check
and emits a warning `skill "<id>" excluded from engine "<engine>"`. This is
the escape hatch for deliberately single-engine skills.

## Adding a new capability

Three places to touch:

1. **The enum** — add `"my-cap"` to `CAPABILITIES` in `src/types.ts`.
   Zod will recognize it automatically (the schema reads `CAPABILITIES`).
2. **`CAPABILITIES_MATRIX`** — list the engines that support it
   (`src/types.ts`). Omitting = blocking for that engine.
3. **`DEGRADED_CAPABILITIES`** — optional, if the engine supports it but
   less well (`src/types.ts`).

No change needed in the renderers or in `checkSkillCapabilities`:
the logic is table-driven. A test in `src/render.test.ts` will check that
filtering works for your new capability — just add a case.

## Debug

- **A skill silently disappears?** Run the CLI with `--engines <engine>` and
  inspect stderr — a blocking warning always shows up there.
- **Too many degradation warnings?** Check `DEGRADED_CAPABILITIES` —
  they accumulate per required capability.
- **The Zod enum rejects?** If you see `Invalid enum value` at parse time,
  `CAPABILITIES` and `requires:` have diverged: align the frontmatter or
  the enum.

## Pitfalls

- **`DEGRADED_CAPABILITIES` is not a subset of `CAPABILITIES_MATRIX`
  by construction**. If you list `["multi-step"]` as degraded for an
  engine where `multi-step` is *not* supported, the `else if` branch never
  runs — the skill is simply skipped. Keep both tables consistent.
- Warnings are **not deduplicated**: if three skills declare
  `requires: [multi-step]` on codex-cli, you will get three warning lines.
  Deliberate — it helps track down the affected skills.
