---
status: accepted
date: 2026-06-16
---

# Project skills as optional seventh pillar (`docs/skills/`)

## Context

The harness ships 8 built-in doc skills under `src/skills/`. Projects
can override or disable them locally via `.harness-overrides/`
(gitignored). Neither path supports **domain-specific skills**
versioned with the project and shared across the team: "how to
implement a new plugin", a migration runbook, a review checklist, a
persona of the team's own.

## Decision

`docs/skills/` is an **optional** pillar. Files matching
`docs/skills/*.skill.md` are discovered at `init` and `update`, use the
same frontmatter schema as built-in skills, and are rendered alongside
them into every target engine.

Merge order: stock, then project, then overrides. A project skill with
the same `id` as a stock skill replaces it. Overrides (`disable.yaml`)
can disable any skill, including project skills.

No slash command is generated for a project skill; it is invoked by
name.

## Consequences

- Projects get a committed, reviewable home for domain knowledge that
  agents consume natively. Since 2.0 this is also where a team keeps a
  persona or a code auditor the harness no longer ships
  ([no-personas-no-code-judgment](./no-personas-no-code-judgment.md)).
- `docs/skills/` is not a required directory; the linter does not flag
  its absence.
- `AGENTS.md` mentions `docs/skills/` in its project map when project
  skills are present.
- Possible future work: project-level commands and a linter for
  project skill quality.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Make `.harness-overrides/` committable | Mixes local customisation with shared knowledge; breaks the gitignore contract |
| `docs/knowledge/` or `docs/guides/` | Non-standard naming; the `*.skill.md` extension already carries the meaning |
| A separate `project-skills.yaml` manifest | Extra indirection; glob discovery matches how stock skills are loaded |

## History

- 2026-06-16: decided, next to 9 built-in skills.
- 2026-10-22, c45b319: 8 built-in skills; the pillar becomes the home of
  team personas and auditors.
