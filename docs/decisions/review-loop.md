---
title: A review session edits the docs in place and a skill runs the loop
status: accepted
date: 2026-11-21
author: Vaubaan core
---

# A review session edits the docs in place and a skill runs the loop

## Context

A maintainer wants to watch the docs change while talking to the agent, and
to comment the [view](./context-view.md) and have the agent apply each
comment, without committing and with a way back. The harness has no runtime,
starts no engine, and must behave the same for the three engines.

## Decision

A review session copies `docs/` and `README.md` to
`.vaubaan/review/snapshot/`, then the agent edits the real files. A server
reachable only from the local machine, behind a random token, rebuilds and
pushes the view on each change and alone writes the session file. The CLI is
the tool (`review start | next | reply | keep | discard`), the shipped skill
`canvas-review` is the loop; the harness never starts an engine and never
commits. Contract:
[spec §10.4](../spec/coding-agent-harness.md#104-view-and-review).

## Consequences

- `discard` restores the snapshot byte for byte, untracked files included,
  and touches nothing outside `docs/` and `README.md`.
- The agent writes threads only through `review reply`; one live session
  per repo.
- `review next` returns on a timeout with its own exit code, so an engine's
  command time limit never ends the loop.
- This server is the one process allowed to outlive a command (spec §1.1).

## Rejected alternatives

### A draft tree under `.vaubaan/draft/`
Every writer skill and linter would have to read a virtual tree, and the
preview would not be what lint checks.

### A snapshot through the version-control stash
It skips untracked files: a discard would lose a doc never added.

### The server starts the engine
Couples the harness to three engine command lines; the agent is already in
the conversation.

### Comments on a hosted page, or the browser's file system access
Tied to one vendor's account, or to one browser family.
