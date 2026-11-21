---
title: A pillar is active when its folder exists, and only the README is required
status: accepted
date: 2026-11-21
author: Vaubaan core
---

# A pillar is active when its folder exists, and only the README is required

## Context

Six pillars were mandatory from the first commit: a project that had just
started needed test plans and a release workflow before it had tests or a
release. Each pillar added since shipped its skill and command to every
project, used or not, so the harness grew for everyone. A harness that
demands a mature organization on day one is not adopted on day one.

## Decision

The core is `README.md` and `docs/spec/`; only a missing README fails the
lint. Every other pillar is **active** when its folder under `docs/`
exists, and inactive otherwise: no linter, no skill, no command, no line of
the project map. `vaubaan-harness add <pillar>` activates one: it writes
the pillar's starter files and re-renders. The always-rendered
`harness-guide` skill tells the agent when a pillar is worth adding;
`harness-upgrade` carries the migration from one version to the next.
Contract: [spec §9.1.2](../spec/coding-agent-harness.md#912-active-pillars).

## Consequences

- No configuration records the pillars: the tree is the switch. Creating
  the folder by hand then running `update` equals `add`.
- A shipped skill declares its pillars in `pillars:`; it is rendered while
  one of them is active. A new pillar extends an existing writer before it
  ships a new skill.
- A check between two pillars runs only while both are active; an optional
  pillar never makes another one mandatory.
- `doc-audit` never reports an inactive pillar as a gap. Proposing one is
  `harness-guide`'s job, and the human decides.
- Every minor release adds its entry to `harness-upgrade`; a test fails
  when the current version has none.

## Rejected alternatives

### Six mandatory pillars
What 2.x did. Placeholder files written to pass the lint say nothing and
teach the team to ignore the docs.

### Presets (`init --preset=starter|full`)
A maturity label to choose and to record; the folders already say it.

### A list of pillars in the manifest
Two sources for one fact, the tree and the list, to be reconciled.

### Every skill always rendered
Simplest, but each new pillar then costs every project a skill, a command
and a line of context.
