---
title: Capabilities matrix
tracks:
  - src/types.ts
  - src/renderers/common.ts
  - src/renderers/claude-code.ts
  - src/renderers/codex-cli.ts
  - src/renderers/opencode.ts
  - src/parser/schemas.ts
last_reviewed: 2026-10-27
---

# Capabilities matrix — handbook

How a skill's `engines:` and `requires:` decide whether, and how, it is rendered for an engine. Spec: [§4.2](../spec/coding-agent-harness.md#42-capabilities-matrix).

## Start here

- [`src/types.ts`](../../src/types.ts) — `CAPABILITIES`, `CAPABILITIES_MATRIX`, `DEGRADED_CAPABILITIES`: the whole policy is these three tables.
- [`src/renderers/common.ts`](../../src/renderers/common.ts) — `isSkillEngineAllowed` then `checkSkillCapabilities`, called by every renderer.

## Invariants

- The policy is table-driven: adding a capability or degrading one for an engine touches `src/types.ts` only, never a renderer.
- A capability not in `CAPABILITIES` cannot reach the check: `requires` is a `z.enum(CAPABILITIES)`, so a typo fails at parse time.
- `engines` and `requires` are build-time constraints: they are never written into the rendered frontmatter.

## Traps

- A skipped skill takes its command with it: `render()` only renders a command whose `invokes_skill` was rendered on that engine, and the umbrella lists neither.
- `DEGRADED_CAPABILITIES` is not checked against `CAPABILITIES_MATRIX`: a capability listed as degraded but absent from the matrix is simply skipped. Keep both tables consistent.
- Warnings are not deduplicated: three skills requiring `multi-step` give three codex-cli warnings. Deliberate, it names each affected skill.
- Today every engine supports every capability: the skip branch is unreachable until a capability is removed from an engine's matrix, and the only live degradation is `codex-cli` + `multi-step`.

## Debug

- **A skill is missing from one engine's output** — read stderr of `init`/`render`: an exclusion (`excluded from engine`) or a skip (`not supported by … — skipped`) is always printed there.
- **`Invalid enum value` at parse** — `requires:` names a capability that `CAPABILITIES` does not declare.
