---
title: The engine choice is mandatory at init
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# The engine choice is mandatory at init

## Context

[multi-agent-multi-engine-default](./multi-agent-multi-engine-default.md)
made `--engines` optional on `init`: without it, the harness rendered
for Claude Code, Codex and OpenCode at once. The README claimed this
"costs nothing".

In practice a developer who uses one engine received three folders,
several `.gitignore` lines, a Codex hook to approve and an OpenCode
plugin, for tools not installed on their machine. With generated files
now committed ([generated-files-committed](./generated-files-committed.md)),
that clutter would also land in the repository and in every pull
request that touches the harness.

The decision that rejected "a single `--engine`" was about allowing
several engines, not about defaulting to all of them.

## Decision

`--engines=<list>` is required on `init` and on `render`. There is no
default. The value is a comma-separated subset of `claude-code`,
`codex-cli`, `opencode`; an empty or missing value fails with a message
that lists the three. `update` keeps the engines recorded in the
manifest and takes no engine option.

Multi-engine installs remain possible and are still rendered side by
side; only the implicit "all three" disappears.

## Consequences

- Nothing is rendered for a tool the project does not use.
- Scripts and CI steps that ran `init .` without an engine must add
  the option. This is a breaking change, shipped in 2.0.
- The README quick start names the engine explicitly.
- The test suite no longer has a "defaults to all engines" scenario.

## Rejected alternatives

### Keep the default and document `--engines` better

The default was the problem: it rendered, and now would commit, files
for absent tools.

### Add an explicit `--engines=all` shortcut

Convenient, but it recreates the ambiguity in scripts and keeps the
three-engine render as a one-word choice. Listing the engines is as
short and leaves no doubt.

### Detect installed engines on the machine

Heuristic, machine-dependent, and wrong for a repository shared by
people with different tools. The choice belongs to the project, not to
the machine `init` happens to run on.
