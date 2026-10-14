# Stack-aware render + lint

**Date:** 2026-05-31
**Status:** superseded by [stop-hook-lint-loop](./stop-hook-lint-loop.md) (2026-06-01)
**Author:** Vaubaan core

> **Historical context (2026-09-20)**: CAR is now abandoned.
> The references to its integration below belong to this already
> superseded decision; they do not announce current support.
> See [the removal of CAR couplings](./retire-coding-agent-runner-coupling.md).

> **Note (2026-06-01)**: the `detectStacks` mechanism + per-stack
> filtering was removed in v0.6.1. It was meant to feed an
> `injectHarness` that never materialized — we switched to the
> Stop-hook, which invokes the tech-agnostic mechanical linters
> without needing to know the stack. The `Linter.stacks?` field
> and `runLinters({ stacks: [...] })` were removed, and
> `detectStacks` is no longer exported from `@vaubaan/harness`.
> This ADR stays in the repo to trace the initial reasoning.

## Context

Before this ADR, `vaubaan-harness init` rendered exactly the same
content (4 personas, 9 skills, 9 commands, 12 mechanical linters)
regardless of the nature of the target repo — a Node service, a Python
script, a Go binary. That was a reasonable simplification as long
as:

1. the rendered content was strictly engine-specific (a `coding`
   agent that does not talk about any particular stack), and
2. the 12 mechanical linters were all stack-agnostic (presence
   of doc files, frontmatter schemas, link resolution).

But the calling runtime (CAR: `coding-agent-runner`) now needs to
**pass the persona the stack information** detected at the root of
the freshly cloned worktree, so that the agent lands immediately on
the right conventions (`npm test` vs `pytest` vs `go test`). Moreover,
we want to leave the door open for stack-specific mechanical linters
without having to rebuild the pipeline.

## Decision

The harness gains a `src/stacks.ts` submodule that detects a repo's
root stacks (`node`, `python`, `go`, `rust`) via sentinel
files:

| Stack    | Sentinels                                                                |
| -------- | ------------------------------------------------------------------------ |
| `node`   | `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`       |
| `python` | `pyproject.toml`, `requirements.txt`, `setup.py`, `setup.cfg`, `Pipfile` |
| `go`     | `go.mod`                                                                 |
| `rust`   | `Cargo.toml`                                                             |

`detectStacks(repoRoot): readonly Stack[]` returns the sorted list
of stacks present at the root (multi-stack supported). No match
= empty array ("unknown", not an error).

`init` invokes `detectStacks(targetDir)` by default and propagates
the detected stacks to:

- **`AGENTS.md`** (umbrella, engine-neutral) — a
  `## Detected stacks` section appears if the list is non-empty.
- **`.harness-manifest.json`** — optional `detectedStacks` field
  alongside `engines`, `files`, `renderedAt`. The CAR runtime can
  read it back to propagate it to the sandbox or to supervision.

The manifest version goes from `2` to `3` (field added).

The `Linter` interface gains an optional field
`stacks?: readonly Stack[]`. `runLinters({ stacks: [...] })` filters:
linters without `stacks` (stack-agnostic, like all 12 current
ones) always run; a linter with `stacks: ['node']` is
skipped when the filter does not contain `'node'`. No
stack-specific linter ships in this release — we only install
the filtering mechanism.

On the CLI side, `init` gains `--no-detect-stacks` for contexts where
the caller already knows the stack (tests, fixtures).

On the public API side:

- new export `./stacks` → `detectStacks`, `STACKS`, `Stack`
- new export `./init` → `initCommand`, `planInit`,
  `writeFilesToTarget`, types — so that a runtime like CAR can
  call `init` without `spawn`ing a child process.

## Consequences

- **Runtime-friendly**: CAR calls `initCommand({ targetDir })`
  programmatically after its `git clone`, without depending on
  `npx`, the PATH, or whether the binary is installed in the
  container.
- **Contextualized persona**: an agent reading `AGENTS.md` sees
  `Detected stacks: node` immediately and can adjust without
  re-scanning the repo.
- **Linter extensibility**: adding a stack-specific linter
  (Python typing, Go vet) will no longer require modifying the pipeline
  — it declares its `stacks` field and `runLinters` filters it.
- **Manifest compat**: v3 adds an optional field. A v2 install
  (old manifest on disk) can no longer be read with `readManifest` —
  this is intentional: the contract is *"the harness is gitignored
  and injected at every spinup"*, so manifests never survive
  a version bump. A dev dogfooding `init` locally
  must run a v3 `init` over their v2 (overwrite) or
  manually delete the obsolete manifest.
- **Conservative detection**: only sentinels at the root
  count. A Node repo with a Python `tools/` declares *only*
  `node`. This is the right default: we type the primary surface
  the agent sees, not the whole ecosystem.

## Rejected alternatives

- **Detect the stack via content heuristics** (e.g. parse
  `package.json` to check `engines.node`). More precise but
  useless given the usage: a repo with a `package.json` at the root
  *is* a Node repo, we do not need to check `engines`.
- **Embed detection in `render()`** rather than in `init`.
  Rejected: `render` must stay pure, callable without `targetDir` (see
  `vaubaan-harness render --out=/tmp/preview`, which has no target
  repo). Detection is an install step, not a rendering step.
- **Add a linter for each stack now** (lint:node-tests,
  lint:python-pyproject). Refused: we install the mechanism, but we
  wait for a real need before adding specific linters.
  See ADR [linters-mechanical-vs-skills](./linters-mechanical-vs-skills.md)
  for the golden rule — a linter must be worth the cost of writing it.
- **Keep `spawn`ing the CLI from the CAR runtime**. Works, but
  adds a PATH + container + interactivity (tty) binding that is
  better avoided when a direct import does the job.
