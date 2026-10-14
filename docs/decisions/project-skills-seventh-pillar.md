---
status: accepted
date: 2026-06-16
---

# Project skills as optional seventh pillar (`docs/skills/`)

## Context

The harness ships 9 built-in skills (doc writers, clean-code guardian, etc.)
living in `src/skills/`. Projects can locally override or disable them via
`.harness-overrides/` (gitignored). Neither path supports **domain-specific
skills** versioned with the project and shared across the team (e.g. "how to
implement a new plugin", "migration runbook").

## Decision

Introduce `docs/skills/` as an **optional** documentation pillar. Files
matching `docs/skills/*.skill.md` are discovered at `init` time, use the
**same frontmatter schema** as built-in skills, and are rendered alongside
them into every target engine.

Merge order: `stock` -> `project` -> `overrides`. A project skill with the
same `id` as a stock skill replaces it (identical semantics to
`mergeById`). Overrides (`disable.yaml`) can disable any skill including
project skills.

No slash-commands are auto-generated for project skills; they are
agent-invocable only.

## Consequences

- Projects get a committed, reviewable home for domain knowledge that agents
  can consume natively.
- `docs/skills/` is **not** in `REQUIRED_DIRS` --- the linter does not flag
  its absence (unlike the 5 mandatory pillars under `docs/`).
- The umbrella `AGENTS.md` conditionally mentions `docs/skills/` in its
  "Project map" section when project skills are present.
- Future work: project-level commands (`docs/commands/`) and a dedicated
  linter for project skill quality.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Make `.harness-overrides/` committable | Mixes local customisation with shared knowledge; breaks `gitignore-harness` linter contract |
| `docs/knowledge/` or `docs/guides/` | Non-standard naming; the `*.skill.md` extension already carries semantic meaning in the harness ecosystem |
| Separate `project-skills.yaml` manifest | Extra indirection; the glob-based discovery (`*.skill.md`) is consistent with how stock skills are loaded |
