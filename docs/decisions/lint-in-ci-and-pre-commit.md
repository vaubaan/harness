---
title: Lint in CI and pre-commit, no engine Stop hook
status: accepted
date: 2026-10-22
author: Vaubaan core
supersedes: stop-hook-lint-loop, opencode-v1-v2-stop-hook-plugin
---

# Lint in CI and pre-commit, no engine Stop hook

## Context

Since [stop-hook-lint-loop](./stop-hook-lint-loop.md) the harness
rendered a Stop hook into each engine: `.claude/settings.json`,
`.codex/hooks.json` and an OpenCode plugin. At the end of every dirty
turn the hook ran the linters and, on failure, re-injected the report
into the session so the agent would fix the docs before handing back.

Two costs became clear during the 2.0 design session of 2026-10-22.

- **Tokens, invisibly.** Every re-injection is a full agent turn with
  the whole context loaded. When the agent cannot fix what the linter
  reports, a false positive or a `tracks:` on a file it has no reason
  to touch, it loops until the no-progress guard stops it. Two or three
  extra turns on a large context, with nobody watching.
- **Fragility, concentrated.** Three hook mechanisms with three
  lifecycles: Codex needs project trust and an explicit hook approval,
  OpenCode broke the plugin shape between 1.x and 2.x
  ([opencode-v1-v2-stop-hook-plugin](./opencode-v1-v2-stop-hook-plugin.md)),
  and the hook files are shared with the project, which produced the
  merge code removed by
  [no-mcp-no-code-merge](./no-mcp-no-code-merge.md). Half the decisions
  in this folder are about hooks, for a documentation linter.

CI already ran the same linters on every pull request
([github-actions-ci](./github-actions-ci.md)). It is uniform across
engines and visible to the whole team.

## Decision

The Stop hook is removed. The linter runs in three places, none of
them inside an engine:

1. **CI**, the gate. `npx @vaubaan/harness lint` fails the pull
   request.
2. **A git pre-commit hook** the project installs (husky or
   `core.hooksPath`). Zero tokens, engine-agnostic. The agent sees a
   failed commit as an ordinary tool result in its own flow, not as a
   turn injected from outside; the human sees it in the transcript.
3. **On demand.** `AGENTS.md` tells the agent to run lint before it
   commits.

Consequences in the package:

- No engine settings file is rendered or written anymore. The
  `renderStopHook` method, the `src/stop-hook/` module, the `.harness/`
  retry state and the `--no-stop-hook` option are gone.
- The manifest fields `stopHookInstalled` and `stopHookEngines` are
  dropped on read.
- `.claude/settings.json` and `.codex/hooks.json` join the released
  paths: a manifest that lists one drops it with a warning and the file
  stays the project's.
- The `stop-hook` CLI command stays as a hidden no-op that exits 0, so
  a Stop hook entry written by 1.x does not fail every turn before it
  is removed. `init` and `update` warn when such an entry is still
  present. The no-op goes away in 3.0.

## Consequences

- The agent gets feedback at commit time instead of at the end of the
  turn. The context it needs to fix the docs is still loaded, since the
  commit happens in the same session.
- The harness touches nothing engine-specific beyond skills, commands
  and `AGENTS.md`. No approval flow, no plugin API to track.
- A project that does not install the pre-commit hook relies on CI
  alone. That is the team's choice, written in `docs/workflow/`.
- The `.harness/` entry is no longer required in `.gitignore`.
- [github-actions-ci](./github-actions-ci.md) is amended: CI is the
  only mechanical gate, no longer "aligned with the in-session hook".

## Rejected alternatives

### Keep the Stop hook with a tighter no-progress guard

A guard bounds the loop but does not make its cost visible, and keeps
the three engine mechanisms and their shared-file problem.

### Keep the Stop hook for Claude Code only

The engine where it worked best. It would still write into a shared
settings file and keep the re-injection cost, for one engine out of
three.

### A lint-only skill invoked by the agent

That is what "on demand" is: the CLI is the skill. A Markdown skill
wrapping a command adds nothing.
