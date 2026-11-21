---
title: The view is derived on demand, local and self-contained
status: accepted
date: 2026-11-21
author: Vaubaan core
---

# The view is derived on demand, local and self-contained

## Context

Reviewing `docs/` as Markdown is slow: tables, links between pillars and the
intent tree are hard to read, and the parsers and linters already know the
graph but show it nowhere. Making HTML the source would break the skills and
`AGENTS.md` that every engine reads as Markdown, cost the agent more tokens
and blur the diffs. The [intents-pillar](./intents-pillar.md) decision left
any viewer to a decision of its own.

## Decision

Markdown stays the only source. `vaubaan-harness view` derives
`.vaubaan/graph.json` from the parsers the linters use and from the lint
report, and renders one self-contained page: no network request, content in
the markup, identical bytes for an identical tree, a canvas drawn by the
harness itself. Both files are local and uncommitted. Contract:
[spec §10.4](../spec/coding-agent-harness.md#104-view-and-review).

## Consequences

- What the view shows comes from a parser the linters share; no reader
  exists for the view alone.
- The view is not a gate: it exits `0` and no linter reads it.
- Node ids are stable and the output deterministic, so committing the view
  later would need only `lint:generated-fresh`.
- A fact the docs do not state (a pointer from a requirement to code, test
  coverage) is a spec change first, never a guess of the view.

## Rejected alternatives

### HTML docs as the source
Every engine reads skills and `AGENTS.md` as Markdown; HTML costs more tokens
and produces noisy diffs.

### A committed `graph.json`
Diff noise on every doc edit and a second source to reconcile.

### A graph or diagram library
A dependency in a page that must open offline, and a layout that moves
between versions; frames per pillar and a tree lay out at build time.

### Importing the view into a hosted design tool
Ties every review to one vendor's account and service.
