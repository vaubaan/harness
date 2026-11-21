---
title: An optional profiles pillar says who the project serves, their pains and gains
status: accepted
date: 2026-11-21
author: Vaubaan core
---

# An optional profiles pillar says who the project serves, their pains and gains

## Context

An intent names its actors, but nothing defined them: a free string, with
no needs attached. The user research a team does (who the users are, what
hurts, what they hope for) stayed in a slide deck, and no agent could tell
which pain an intent relieves or which pain nothing relieves yet. The word
*persona* is taken: the harness ships no agent persona
([no-personas-no-code-judgment](./no-personas-no-code-judgment.md)).

## Decision

An optional pillar `docs/profiles/`: one Markdown file per user profile,
with its pains and gains as named, ranked bullets and the evidence it rests
on. While the pillar is active, an intent's `actors:` are profiles and a
terminal intent may declare the pains it `relieves:` and the gains it
`delivers:`. The fit between profiles and intents is rendered into the
generated index `docs/profiles/README.md`. No new skill: `intent-writer`
writes profiles. Contract:
[spec §9.1.4](../spec/coding-agent-harness.md#914-profiles).

## Consequences

- The customer jobs of a profile are not written in its file: they are the
  level-1 intents that name it as an actor, listed by the index.
- A profile is a `hypothesis` until evidence backs it; a `validated`
  profile without evidence fails the lint.
- Without the pillar, intents behave as before: actors stay free strings
  ([pillars-on-demand](./pillars-on-demand.md)).
- A pain no intent relieves is shown by the index and judged by
  `doc-audit`; it never fails the lint, since a known gap is a product
  choice.
- Research material is not a pillar: evidence is a link, to a file of the
  repo or elsewhere.

## Rejected alternatives

### A "Users" section in each spec
A profile cuts across subsystems, and a spec is one subsystem in 50 to 100
lines.

### A `docs/research/` pillar
Interview notes hold personal data and no contract can be linted on them.

### A dedicated `profile-writer` skill and command
A third of the work of writing an intent is naming who it is for; one
writer covers both.

### Ordered user journeys in the same pillar
A sequence of steps is another object; it stays an open question of the
spec.
