# Multi-agent and multi-engine by default at install

**Date:** 2026-05-22
**Status:** superseded by [no-personas-no-code-judgment](./no-personas-no-code-judgment.md) and [engine-choice-mandatory](./engine-choice-mandatory.md) (2026-10-22)
**Author:** Vaubaan core

> **Superseded (2026-10-22)**: the harness ships no persona any more,
> and `--engines` is mandatory. What stands from this decision is that
> several engines can be rendered side by side. The text below is kept
> as history.

> **Updated context (2026-09-20)**: CAR has been abandoned. Its mentions
> below describe the caller envisioned at the time of this decision.
> Rendering all personas still applies; the human or their tool
> chooses which one to invoke, without depending on CAR. See
> [the removal of CAR couplings](./retire-coding-agent-runner-coupling.md).

## Context

The initial harness v0.1 scoped each `init` to **a single agent**
(`--agent=coding|review|merge|planning`) and **a single engine**
(`--engine=claude-code|codex-cli|opencode`). Practical consequence:
when you wanted to switch between personas in the same project
(e.g. move from the `coding` persona to the `review` persona depending on the
session), you had to re-run `init` — which would clobber `AGENTS.md`
and the manifest. Same for engines: a project that has to work
under claude-code **and** codex-cli (real case: devs with multiple local
engines + CI on a given engine) required two separate,
incompatible installs.

The user explicitly corrected this (2026-05-21):

> "I never asked you to scope a harness to one kind of agent"

And later, for engines:

> "you can install several coding agent engines"

Per-kind scoping at install was a bad abstraction inherited
from a confusion between the harness (a static configuration tool) and
CAR / the runtime orchestrator (which is what chooses *which* persona
to invoke for *which* session).

## Decision

`init` **always renders the 4 personas and all requested
engines**, with no per-id filtering at install:

- **CLI signature**: `vaubaan-harness init <target> [--engines=<list>]`.
  No `--agent` flag. `--engines` is optional: by default all
  available engines (`claude-code, codex-cli, opencode`) are
  rendered.
- **Programmatic signature**: `render({ harness, engines, overrides? })`
  takes `engines: ReadonlyArray<Engine>`. No more `agent` parameter
  nor singular `engine`.
- **Deployed layout**: for each engine ∈ `engines`, we render
  `.<engine>/agents/<id>.md` for each of the 4 personas, plus the
  engine-native skills and commands. At the root: an engine-neutral umbrella
  `AGENTS.md`, plus the `CLAUDE.md` stub if claude-code ∈ `engines`.
- **Manifest v2**: `{ version: "2", engines: Engine[], files: string[],
  renderedAt }`. v1 (`engine: string, agent: string`) is not
  backward-compatible — migration is done by a manual `uninstall`
  of the v1 files followed by a fresh `init`.
- **Choosing which persona to invoke is a runtime decision**, not
  an install parameter. It is the human, CAR, or any other
  calling orchestrator that points to the right `.<engine>/agents/<id>.md`
  at session time.

## Consequences

**Benefits**:

- A harnessed project is immediately usable with any
  persona and any locally installed engine, without
  reinstalling.
- The harness becomes again what it claims to be: a pure
  transformation `(catalog, engines, overrides) → files`. No hidden runtime
  state in the install choice.
- Simplifies the spec: §0.1, §3, §8 no longer talk about a
  "chosen AgentId" or a "single target engine".

**To accept**:

- Longer manifest tail (up to 62 files for a
  3 engines × 4 personas install). Acceptable.
- Code↔doc drift during the refactor touched 5 docs (see
  `drift-report.md` of 2026-05-22). Fixed in parallel.
- No smooth v1 → v2 manifest migration. Deliberate — the cost of
  maintaining a legacy reader is not justified for a pre-release
  v0.1.

## Rejected alternatives

- **Keep `--agent` but allow `--agents=<list>`** — adds a
  flag that has no reason to be restricted. If we always render
  all 4, no flag is needed.
- **Keep a single `--engine`** — same argument: if a project needs
  several engines (real case), restricting to 1 is arbitrary.
- **`.cah/<engine>/` indirection + symlinks** — briefly tried.
  Rejected: frontmatters differ per engine (YAML `name:` for claude,
  YAML `id:` for codex, TOML for opencode), so the same file cannot be shared
  via symlink; the indirection only bought structure,
  not content. See the 2026-05-21 discussion (marginal storage gain vs
  added complexity).
- **CAR-side scoping** — delegate the agent/engine choice to CAR at
  spin-up. We already do that at runtime; it does not exempt the harness
  from rendering everything at install so that CAR has its options at
  hand.

## References

- Commit: `f05434d` (refactor: drop scoping at install — render all
  agents + all engines).
- Drift report: `drift-report.md` at the repo root, generated at
  refactor time (ephemeral artifact, not committed).
- Spec §0.1, §3, §8 — aligned in parallel with the commit.
- Memory feedback: `feedback_harness_multi_agent` (captures the
  user's correction of 2026-05-21).
