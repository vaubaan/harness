---
title: The harness is standalone, with no runtime coupling
status: accepted
date: 2026-09-20
author: Vaubaan core
---

# The harness is standalone, with no runtime coupling

## Context

The harness was first designed next to a session runtime, CAR
(`coding-agent-runner`), which was to install it at session start,
read an end-of-turn signal and later host a supervisor role. CAR was
abandoned in September 2026. Two couplings survived it: `check` and
`lint:gitignore-harness` required a `.car/` entry, and the end-of-turn
check wrote a signal to `CAR_TURN_END_LOG` or
`/var/run/car/turn-end.log`. The documentation also announced an
automatic injection at session startup and a supervisor support that
was only ever proposed.

## Decision

The harness is a standalone package: a CLI and a library that drop
files into a project and lint its docs. No daemon, no runtime service,
no protocol with an orchestrator.

- Project checks require no `.car/` entry; an old one may remain.
- No end-of-turn signal is written anywhere; `CAR_TURN_END_LOG` has no
  effect.
- Installation and update are explicit operations via CLI or API. No
  injection by a session runtime is promised.
- Supervision, task backlogs and session orchestration are out of
  scope. A team that wants them keeps them in its own tooling or in
  `docs/skills/`.

## Consequences

- A standalone project no longer needs to ignore a CAR directory it
  does not use.
- A consumer that relied on the end-of-turn signal must handle its
  own notifications; no replacement signal is introduced.
- The spec's position section describes the flow without any caller.

## Rejected alternatives

### Keep the conventions for compatibility

They would maintain a dependency on an abandoned runtime and useless
writes on every agent turn.

### Replace CAR with another implicit supervision

No new runtime has been chosen. The standalone contract requires no
additional protocol to run the documentation checks.

### Ship supervisor support in the harness (proposed 2026-06-04)

A `tasks.md` schema, a `supervisor` subcommand, a `./supervisor` export
and five supervisor linters were designed for CAR. None was
implemented; the harness stays a static transformation.

## History

- 2026-06-04: supervisor support designed for CAR (decision
  `supervisor-harness-design`), never implemented.
- 2026-09-20: CAR abandoned; `.car/` requirement and end-of-turn log
  removed, supervisor plan withdrawn (1.1.1).
- 2026-10-22, c45b319: the end-of-turn check itself removed
  ([lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md)).
