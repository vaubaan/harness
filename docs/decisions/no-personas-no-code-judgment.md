---
title: No agent personas, no code-quality judgment in the harness
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# No agent personas, no code-quality judgment in the harness

## Context

Until 2.0 the harness shipped four agent personas (`coding`, `review`,
`merge`, `planning`), rendered as native subagents in each engine, and
one code-quality skill, `clean-code-guardian` with its `/clean-code`
command, read against the optional `docs/quality/` pillar
([quality-optional-pillar](./quality-optional-pillar.md)).

The 2.0 design session of 2026-10-22 settled what the harness is: the
machine that keeps a project's context true while the code moves. Two
things did not fit.

- **The personas prescribed a workflow.** Plan, code, review, merge,
  with mandatory first steps and output files. Teams differ: some have
  no review agent, some merge through bots. The one valuable part, the
  doc-first order, was already in `AGENTS.md`. What the engines call an
  "agent" is also a subagent spawned by the main session, not a
  persona a human starts a session as, so the model did not match the
  mechanism on two engines out of three.
- **The quality skill judged code.** It carried opinions on strict
  typing, SOLID and hexagonal architecture, while the rest of the
  harness is tech-agnostic. Judging code is not maintaining context.

## Decision

1. **No personas.** The `*.agent.md` pivot format, the `agents/`
   content folder, `AGENT_IDS`, `renderAgents` and the
   `.<engine>/agents/` output are removed. The harness imposes one
   working rule, the doc-first order in `AGENTS.md`, and requires the
   team's own workflow to be written in `docs/workflow/`, where agents
   read it. It supplies no role and no phase.
2. **No code-quality skill.** `clean-code-guardian` and `/clean-code`
   are removed. The `docs/quality/` pillar stays: it is information the
   team maintains, `lint:quality-schema` checks its shape, and
   `AGENTS.md` points agents to it when it exists.
3. **The team keeps what it wants in `docs/skills/`.** A persona, a
   code auditor or a review checklist is a project skill, versioned in
   the repository and rendered like the built-in ones
   ([project-skills-seventh-pillar](./project-skills-seventh-pillar.md)).

Several engines can still be rendered side by side; the choice is
explicit ([engine-choice-mandatory](./engine-choice-mandatory.md)).

## Consequences

- The package ships 8 doc skills and 8 commands, and no agent files.
  Existing `.<engine>/agents/` files are removed as stale on the next
  `init` or `update`.
- The `review` persona's rule "run `doc-audit` and `drift` before any
  verdict" is no longer enforced by the harness. A team that wants it
  writes it in `docs/workflow/`, where the workflow template proposes
  it as a default.
- `docs/quality/code-quality.md` loses its reader skill. Agents read
  the file directly.
- A project that invoked `/clean-code` keeps the skill by copying it to
  `docs/skills/` before updating.
- Breaking change, shipped in 2.0.

## Rejected alternatives

### Keep the personas as phase skills (`/plan`, `/review`, `/merge`)

Still a workflow the harness would dictate. The boundary that holds is:
how the context changes when the project changes is the harness's
business; how the team organizes its work is the team's.

### Keep one native agent for isolated review

A read-only review in a fresh context is a real mechanism, but it is a
team choice, and the engines expose subagents natively. A project adds
it in `docs/skills/`.

### Keep `clean-code-guardian` as the default reader of `docs/quality/`

The pillar does not need a reader skill: `AGENTS.md` already tells the
agent to read the file before writing or auditing code.

### Scope an install to one persona (`--agent`)

Tried in v0.1 and rejected on 2026-05-21: the harness is static
configuration, choosing a persona was a runtime matter.

## History

- 2026-05-22: `init` always rendered the four personas for every
  requested engine, with no `--agent` flag (decision
  `multi-agent-multi-engine-default`).
- 2026-09-20: personas no longer listed their skills and commands; the
  engines discover them natively.
- 2026-10-22, c45b319: personas and `clean-code-guardian` removed.
