---
title: Lint in CI and pre-commit, no engine Stop hook
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# Lint in CI and pre-commit, no engine Stop hook

## Context

A Stop hook per engine ran the linters at the end of each turn and
re-injected failures into the session. Each re-injection was a full,
unseen agent turn, looping when the agent could not fix the report, and
the three hook mechanisms (Codex trust and approval, OpenCode plugin API
changes, settings files shared with the project) concentrated the
fragility of the package. CI already ran the same linters on every PR.

## Decision

The harness installs no engine hook. The linters run in CI (the gate), in
a git pre-commit hook the project installs, and on demand, as
`AGENTS.md` asks the agent before each commit.

## Consequences

- The harness writes nothing engine-specific beyond skills, commands and
  the umbrella files: no settings file, no plugin, no approval flow.
- The agent gets the report as a failed commit in its own flow; a project
  without the pre-commit hook relies on CI alone, its choice, written in
  `docs/workflow/`.
- The hidden `stop-hook` command stays a no-op until 3.0 so that hook
  entries written by 1.x do not fail every turn.

## Rejected alternatives

### Keep the Stop hook with a tighter no-progress guard
Bounds the loop but keeps its invisible cost and the three mechanisms.

### Keep the Stop hook for Claude Code only
Still writes into a shared settings file and keeps the re-injection
cost, for one engine out of three.
