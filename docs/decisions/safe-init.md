---
title: init never overwrites what it does not own
status: accepted
date: 2026-10-14
author: Vaubaan core
---

# `init` never overwrites what it does not own

> **Amended (2026-10-22)** by
> [no-mcp-no-code-merge](./no-mcp-no-code-merge.md): rules 2 and 3 below
> (entry-level merge of shared configurations, printed `.codex/config.toml`
> block) no longer apply. A shared file the harness did not write is left
> untouched; the Stop hook block to add is printed. Rules 1, 4 and 5 stand.

## Context

Until 1.3.2, `init` wrote every rendered file unconditionally. The debug
pass of 2026-10-14 confirmed several ways to lose user data:

- a hand-written `AGENTS.md` or `CLAUDE.md` was replaced silently;
- `.claude/settings.json`, `.codex/hooks.json`, and with `--with-mcp`
  `.mcp.json` and `.codex/config.toml`, were replaced by harness-only
  content, then deleted by `uninstall` because the manifest listed them
  as harness files;
- running `init` after `update` dropped everything `update` had
  preserved: `--preserve` files, user hooks merged into shared files, and
  their ownership records;
- `init` ignored a `.harness-overrides/` folder that `update` loads.

`update` already had the right rules
([project-update-migrations](./project-update-migrations.md),
[safe-project-artifact-lifecycle](./safe-project-artifact-lifecycle.md)):
refuse files outside the manifest, refuse modified managed files, merge
shared configurations entry by entry, and apply everything in one
transaction with a backup. `init` did not use them.

## Decision

`init` and `update` share one installation planner. They differ only in
where the settings come from: `init` takes engines, MCP servers and the
Stop hook choice from its flags; `update` keeps those recorded in the
manifest.

Rules applied by both:

1. **Generated files** (`AGENTS.md`, `CLAUDE.md`, agents, skills,
   commands, the OpenCode plugin): an existing file that the manifest
   does not list, or that changed since the harness wrote it, stops the
   command before any write. All conflicts are reported at once. The
   user moves the content (to `docs/` or `.harness-overrides/`) or keeps
   the file as theirs with `--preserve <path>`, now also accepted by
   `init`.
2. **Shared configurations** are merged entry by entry and only the
   harness entries are recorded as owned:
   `.claude/settings.json` and `.codex/hooks.json` (Stop hook),
   `.opencode/opencode.json` and `.mcp.json` (MCP servers). An existing
   entry with the same name is left as is.
3. **`.codex/config.toml`** is written only if it does not exist yet, or
   if the harness created it and it is unchanged. Otherwise it is left
   untouched and a warning prints the block to add by hand.
4. Settings recorded by a previous run are kept: preserved files, entry
   ownership, and the overrides folder. A `.harness-overrides/` folder in
   the project is loaded by default, as `update` already did.
5. Changes are applied in one transaction with a private backup outside
   the project, and rolled back on error.

`uninstall` removes a generated file only if it is unchanged since the
harness wrote it; a modified one is kept with a warning.

## Consequences

- `init` can be run on any existing project without risk to its files.
  The first run may stop with a list of conflicts to resolve.
- Re-running `init` to change engines, MCP servers or the Stop hook keeps
  everything `update` preserves.
- A `.codex/config.toml` written by the user needs a manual edit to add
  an MCP server.
- `init` creates a backup when it touches files that already existed.
- Installations made before 1.4.0 recorded shared files as whole harness
  files. The planner treats such a file as harness-created when it
  records its entries for the first time, so `uninstall` still removes it
  when nothing else is left in it.

## Rejected alternatives

### Keep `init` as a blind writer and document the risk

The README warned about `AGENTS.md`, but the same risk on
`.claude/settings.json` and `.codex/config.toml` was undocumented and
destroys user permissions and model settings.

### Make `init` refuse to run when a manifest exists

Simpler, but re-running `init` with different flags is the documented
way to change engines or MCP servers.

### Merge `.codex/config.toml` with a TOML parser

It would add a dependency and rewrite the user's formatting and
comments. A printed snippet keeps the user in control.

### A `--force` flag to overwrite conflicts

It would reintroduce the silent data loss this decision removes;
`--preserve` and moving content cover the legitimate cases.
