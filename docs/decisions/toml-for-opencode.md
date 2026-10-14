# 0004 — TOML frontmatter for the opencode renderer

**Date:** 2026-05-21
**Status:** superseded — `superseded_by:` [engine-native-layouts-1-0](./engine-native-layouts-1-0.md)
**Author:** Vaubaan core

## Context

The three target engines have distinct native layouts and, above all,
divergent frontmatter conventions
(see [spec §4.3](../spec/coding-agent-harness.md)):

| Engine        | Native frontmatter |
|---------------|--------------------|
| `claude-code` | YAML (`---`)       |
| `codex-cli`   | YAML (`---`)       |
| `opencode`    | TOML (`+++`)       |

The `*.skill.md` pivot format is YAML
(see [ADR _yaml-frontmatter-zod-strict_](./yaml-frontmatter-zod-strict.md)), because YAML
is the Markdown standard read by every editor and every tool
in the chain. What remains is deciding what to emit on the opencode render side.

## Decision

The `opencode` renderer **emits TOML** (delimited by `+++`) in the
output. The `claude-code` and `codex-cli` renderers emit YAML
(delimited by `---`), i.e. the same format as the pivot.

The YAML → TOML conversion is handled by a helper internal to the
opencode renderer (`tomlFrontmatter(data)`), which produces a stable TOML
subset (strings, numbers, booleans, simple lists, tables — no
deep trees, a skill's frontmatter is flat by
construction).

Source and output remain strictly isomorphic in terms of
*data* — only the serialization differs.

## Consequences

- **Native opencode compatibility**: opencode plugins are
  loaded without any extra transformation on the engine side.
- **No surprise for the human**: a human editing a
  `*.skill.md` stays in YAML (a single format to know on the
  contributor side, see [spec §13.2](../spec/coding-agent-harness.md)).
- **Cost**: a TOML serialization helper internal to the opencode
  renderer (~50 lines), no external dependency needed given the
  flat shape of rendered frontmatters.
- **Tests**: the contract is tested via snapshots of opencode renders
  for every skill in the package.

## Rejected alternatives

- **YAML for all three engines**: opencode does not read YAML
  natively in its plugins; it would need a loading wrapper
  on the engine side that we do not control.
- **TOML everywhere (pivot + 3 outputs)**: degrades DX for
  Vaubaan contributors — YAML is more readable for long frontmatters
  with multi-line descriptions, and it is the Markdown standard.
- **Universal JSON Schema injected into the body**: no engine
  consumes it natively, solves nothing.
- **Ask opencode upstream to support YAML**: external
  dependency, roadmap blocker for zero gain on internal usage.
- **Maintain a parallel `*.skill.toml` source for opencode**:
  per-engine duplication, exactly what
  [ADR _multi-engine-pivot-format_](./multi-engine-pivot-format.md) rejects.
