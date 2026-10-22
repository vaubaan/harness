---
title: Generated files are committed and kept fresh by a linter
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# Generated files are committed and kept fresh by a linter

## Context

Until 1.4, everything `init` rendered (`AGENTS.md`, `CLAUDE.md`,
`.claude/`, `.codex/`, `.agents/`, `.opencode/`,
`.harness-manifest.json`) was meant to be gitignored, and
`lint:gitignore-harness` enforced it
([spec §3.3](../spec/coding-agent-harness.md)). Only `docs/` was
committed; every clone had to run `init` to get its agent instructions.

The onboarding discussion of 2026-10-22 showed the crack. A project
that had already committed a `CLAUDE.md` cannot simply add it to
`.gitignore`: the file stays tracked, and the generated content lands
in the next commit. The fix, `git rm --cached`, has a worse effect on
teammates: at the next pull `CLAUDE.md` disappears and their agent has
no instructions until they install the harness and run `init`. The
project's context depended on a locally installed tool, which
contradicts what the harness is for: context that is in the repo.

## Decision

Generated files are committed, like a lockfile or generated code.

- **A clone has everything.** `AGENTS.md`, `CLAUDE.md`, the engine
  folders and the manifest are versioned. An occasional contributor
  without the harness installed gets the same instructions as everyone
  else.
- **A linter keeps them fresh.** `lint:generated-fresh` renders the
  harness with the engines and overrides the manifest records, and
  fails when a committed generated file differs from the render, is
  missing, or is no longer rendered. The fix is always the same: edit
  the source in `docs/` or `.harness-overrides/`, run
  `npx @vaubaan/harness update .`, commit.
- **`lint:gitignore-harness` inverts.** It requires only
  `.harness-overrides/` and `.vaubaan/`, which are local, disposable
  state, and fails when `.gitignore` lists a generated path. The
  `check` command follows the same rule.
- **The version is pinned.** The project installs
  `@vaubaan/harness` as a devDependency, so CI renders with the same
  version as the developer who committed the files.
- **Onboarding is an ordinary commit.** A project that had committed
  its own `CLAUDE.md` renames it, the harness generates its files, and
  both land in the same pull request, reviewed like any change.

## Consequences

- Pull requests show the rendered diff when the harness or a skill
  changes. That is the explicit price of committed generated code, and
  it is reviewable.
- A hand edit to a generated file is caught in CI instead of blocking
  `init` locally. The local conflict rule of
  [safe-init](./safe-init.md) still applies: `init` and `update` refuse
  to overwrite a generated file edited since they wrote it.
- The README `.gitignore` snippet shrinks to two lines.
- Existing projects remove the generated paths from `.gitignore` and
  commit the files once; `lint:gitignore-harness` tells them which
  lines to drop.
- Context loading does not depend on the harness being installed,
  which is a precondition for the engine-native commands that
  [no-personas-no-code-judgment](./no-personas-no-code-judgment.md)
  relies on.

## Rejected alternatives

### Keep the gitignore and untrack committed files with `git rm --cached`

Mechanically fine, but every teammate loses the agent instructions at
their next pull until they run `init`. Context must not depend on a
local tool.

### Commit the generated files without a freshness check

The committed copy drifts from `docs/` and from the harness version at
the first skipped `update`, silently. The linter is what makes the
committed copy trustworthy.

### Commit only `AGENTS.md` and keep the engine folders ignored

Half a context: Claude Code would find its import, Codex and OpenCode
would find no skills. The rule has to be the same for every generated
file.
