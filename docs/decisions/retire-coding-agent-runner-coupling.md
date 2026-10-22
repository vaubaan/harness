---
title: Remove couplings to the abandoned coding-agent-runner
status: accepted
date: 2026-09-20
author: Vaubaan core
supersedes: supervisor-harness-design
---

# Remove couplings to the abandoned coding-agent-runner

> **Amended (2026-10-22)** by
> [lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md): the Stop
> hook and its native continuation, mentioned below, are removed. The
> removal of `.car/` and of the end-of-turn log stands.

## Context

The user confirmed that CAR (`coding-agent-runner`) has been abandoned.
The harness is a standalone package, but two behaviors kept a coupling
to that runtime: `check` and `lint:gitignore-harness` required a
`.car/` entry, and the Stop hook tried to write an end-of-turn signal
to `CAR_TURN_END_LOG` or `/var/run/car/turn-end.log`.

The documentation also announced automatic injection at session
startup. The supervisor support project of 2026-06-04 was only
proposed: the `./supervisor` export, the associated subcommand, the
schemas and the five envisioned linters are absent from the code and
from the package exports.

## Decision

The harness removes these CAR conventions. Project checks no longer
require `.car/`. Stop hooks still decide on lint and on the engines'
native continuation, but no longer emit an end-of-turn log intended
for CAR. The old `CAR_TURN_END_LOG` variable no longer has any effect.

Installation and update are explicit operations via CLI or API. The
harness promises no injection by a session runtime. The historical
supervisor plan is retired, without deleting its text; ADRs that
mention CAR keep their dated context.

## Consequences

- A standalone project no longer needs to ignore a CAR directory it
  does not use. An old `.car/` entry can remain without error.
- The Stop hook no longer writes to an external location associated
  with CAR and no longer produces a warning when that location is
  absent.
- A consumer that relied on this signal must handle its own
  end-of-turn notifications; no replacement signal is introduced in
  this patch.
- Operational removal of the CAR services and their archives remains
  a separate infrastructure operation. The package deletes neither
  historical directories nor session data.

## Rejected alternatives

### Keep the conventions for compatibility

They would maintain a dependency on an abandoned runtime and useless
writes on every agent turn.

### Replace CAR with another implicit supervision

No new runtime has been chosen. The standalone contract requires no
additional protocol to run the documentation checks.

### Delete the historical decisions

Their reasoning remains useful for understanding how the project
evolved. An explicit retirement note prevents reading them as
currently shipped features.

## References

- [Harness spec](../spec/coding-agent-harness.md#01-position)
- [Retired supervisor plan](./supervisor-harness-design.md)
- [Linters](../handbook/linters-architecture.md)
- [Test plan](../tests/integration-tests.md)
