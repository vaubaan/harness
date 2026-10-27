---
title: No agent personas, no code-quality judgment in the harness
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# No agent personas, no code-quality judgment in the harness

## Context

The harness keeps a project's context true while the code moves. Agent
personas (`coding`, `review`, `merge`, `planning`) prescribed a workflow
that teams do not share, and a code-quality skill carried opinions on
typing and architecture in a package that is otherwise tech-agnostic.
Neither maintains context.

## Decision

The harness ships doc-skills only: no persona, no phase, no code audit.
The one working rule it imposes is doc-first, in `AGENTS.md`; the team's
workflow is written in `docs/workflow/`, and a persona, auditor or review
checklist the team wants is a project skill in `docs/skills/`
([spec §9.1.2](../spec/coding-agent-harness.md)).

## Consequences

- A new shipped skill says *how* to maintain a pillar, never *when*: the
  when belongs to the team's workflow.
- `docs/quality/code-quality.md` has no reader skill; `AGENTS.md` tells
  agents to read it before writing or auditing code.
- Several engines can still be rendered side by side; only the roles go.

## Rejected alternatives

### Personas as phase skills (`/plan`, `/review`, `/merge`)
Still a workflow dictated by the harness. How the context changes with the
project is the harness's business; how the team works is the team's.

### Keep one native review agent
A fresh-context review is a real mechanism but a team choice, and the
engines expose subagents natively.
