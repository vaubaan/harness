---
title: An optional journeys pillar holds user intentions anchored to the code
status: accepted
date: 2026-11-09
author: Vaubaan core
---

# An optional journeys pillar holds user intentions anchored to the code

## Context

The six pillars say what the project wants, what it settled, how it works,
how it is tested and shipped. None says what the user does and wants at every
scale, from a level-1 intention to the atomic activity a handler realizes, nor
where a new behavior is specified before it is coded. The README promised
typed transactions (`/story`) and a `docs/todo/` pillar for increments; the
spec stays tech-agnostic and cannot carry pointers to code. The harness reads
only Markdown, git and the existence of files, which is what keeps it
agnostic to the project's language.

## Decision

An optional pillar `docs/journeys/`: one Markdown file per level-1 user
intention, nested headings for the levels below, stories anchored to the code
with `anchors:` (the `tracks:` syntax) and linked to the spec vocabulary with
`requires:` / `creates:`. A node is born `proposed` with acceptance criteria,
becomes `implemented` in the pull request that delivers it, never goes back.
Four mechanical linters check the form and the anchors; `lint:tracks-drift`
covers the anchors' freshness. The only derived file, the index
`docs/journeys/README.md`, is rendered by `init` and `update` like `AGENTS.md`
and covered by `lint:generated-fresh`. The harness parses no source code.
Contract: [spec §9.1.3](../spec/coding-agent-harness.md#913-journeys).

## Consequences

- `requires:` / `creates:` is the one field that restates what the code
  knows. It is a declared contract, checked against the spec vocabulary by a
  linter and against the code by the `drift-detector` skill, never computed.
- The `proposed` nodes are the backlog; no `docs/todo/` pillar is added.
- Anything that needs to read the project's code (capability usage, role
  guards, orphan entry points as a CI gate) or to analyze the graph
  (dominance, quotient graphs, a viewer) is outside the pillar and needs its
  own decision.
- `lint:spec-tech-agnostic` does not apply to `docs/journeys/`: anchors are
  code paths by construction.

## Rejected alternatives

### Flow sections inside `docs/spec/`
Loses the anchors: the spec is tech-agnostic and the linter forbids paths.

### One file per node
Hundreds of files; the tree and its edges become unreadable in a pull request.

### YAML or JSON journeys
Outside the Markdown + frontmatter convention every pillar and skill follows.

### A separate `docs/todo/` pillar
Two sources for one increment, to be reconciled at delivery.

### A committed derived graph (JSON, report, HTML)
Diff noise and an ambiguous source of truth; a tool can read the format later.
