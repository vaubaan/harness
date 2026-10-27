---
title: Generated files are committed and kept fresh by a linter
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# Generated files are committed and kept fresh by a linter

## Context

When the rendered files were gitignored, every clone had to install the
harness and run `init` to get its agent instructions, and a project that
had already committed a `CLAUDE.md` could only untrack it, leaving
teammates without instructions at their next pull. The project's context
depended on a locally installed tool, the opposite of context in the repo.

## Decision

Everything `init` renders (`AGENTS.md`, `CLAUDE.md`, the engine folders,
the manifest) is committed like a lockfile. `lint:generated-fresh` fails
when a committed file differs from the current render, and
`lint:gitignore-harness` requires only `.harness-overrides/` and
`.vaubaan/` to be ignored and refuses any generated path.

## Consequences

- A generated file is never edited by hand: edit the source in `docs/` or
  `.harness-overrides/`, run `update`, commit.
- The project pins `@vaubaan/harness` as a dev dependency so CI renders
  with the same version as the committer.
- A change to the harness or a skill shows its rendered diff in the PR.

## Rejected alternatives

### Keep the gitignore and untrack with `git rm --cached`
Every teammate loses the agent instructions until they run `init`.

### Commit without a freshness check
The committed copy drifts silently at the first skipped `update`.

### Commit only `AGENTS.md`
Codex and OpenCode would find no skills; the rule must be the same for
every generated file.
