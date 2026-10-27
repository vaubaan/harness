---
title: A decision file holds a structural decision in force, nothing else
status: accepted
date: 2026-10-27
author: Vaubaan core
---

# A decision file holds a structural decision in force, nothing else

## Context

Decisions were append-only, then current state with a `## History` line per
reversal. Both made the folder a project journal: dozens of files, most of them
implementation details, product rules or release records, read in full by every
agent at a token cost that buys nothing. The other pillars already say what the
code does not; decisions were the exception.

## Decision

A decision file exists only for a choice that is costly to reverse, where a real
alternative was weighed, and that outlives its ticket. It states the rule in force
in about 40 lines; when the choice changes, a new file replaces it, the old one is
deleted and its option moves to Rejected alternatives. Git is the archive.

## Consequences

- Product rules go to the spec, traps and outside settings to the handbook, test
  strategy to `docs/tests/`, tooling and release to `docs/workflow/`.
- No `## History` section and no `superseded` status; the index lists only
  decisions in force.
- `lint:decision-schema` still requires the four sections; `lint:adr-no-tracks`
  and `lint:orphan-decisions` are unchanged.

## Rejected alternatives

### Current state with a History line per reversal

The 2.0.0 position. History lines accumulate and keep release records and dead
options in the file the reader opens; `git log --follow` already answers them.

### Keep superseded files with pointers

The 1.x position. The pointer chain grows and the dead files are the largest in
the folder.
