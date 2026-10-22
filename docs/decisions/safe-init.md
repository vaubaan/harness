---
title: init never overwrites what it does not own
status: accepted
date: 2026-10-14
author: Vaubaan core
---

# `init` never overwrites what it does not own

## Context

Until 1.3.2, `init` wrote every rendered file unconditionally. The debug
pass of 2026-10-14 confirmed several ways to lose user data: a
hand-written `AGENTS.md` or `CLAUDE.md` replaced silently, engine
settings replaced by harness-only content then deleted by `uninstall`,
and a second `init` dropping everything `update` had preserved.

`update` already had the right rules
([project-update-migrations](./project-update-migrations.md),
[safe-project-artifact-lifecycle](./safe-project-artifact-lifecycle.md));
`init` did not use them.

## Decision

`init` and `update` share one installation planner. They differ only in
where the engines come from: `init` takes them from its mandatory
`--engines` option, `update` from the manifest.

Rules applied by both:

1. **A generated file** (`AGENTS.md`, `CLAUDE.md`, skills, commands)
   that exists outside the manifest, or that changed since the harness
   wrote it, stops the command before any write. All conflicts are
   reported at once. The user moves the content to `docs/` or
   `.harness-overrides/`, or keeps the file as theirs with
   `--preserve <path>`.
2. **No file is merged.** A file the harness does not own is left
   byte-for-byte untouched
   ([no-mcp-no-code-merge](./no-mcp-no-code-merge.md)).
3. **Settings recorded by a previous run are kept**: preserved files
   and the overrides folder. A `.harness-overrides/` folder in the
   project is loaded by default.
4. **Changes are applied in one transaction**, with a private backup
   outside the project, and rolled back on error.

`uninstall` removes a generated file only if it is unchanged since the
harness wrote it; a modified one is kept with a warning.

## Consequences

- `init` can be run on any existing project without risk to its files.
  The first run may stop with a list of conflicts to resolve.
- Re-running `init` to change engines keeps everything `update`
  preserves.
- `init` creates a backup only when it touches files that already
  existed.

## Rejected alternatives

### Keep `init` as a blind writer and document the risk

The README warned about `AGENTS.md`; the same risk on engine settings
was undocumented and destroyed user permissions and model settings.

### Make `init` refuse to run when a manifest exists

Simpler, but re-running `init` with different engines is the documented
way to change them.

### A `--force` flag to overwrite conflicts

It would reintroduce the silent data loss this decision removes;
`--preserve` and moving content cover the legitimate cases.

### Merge shared configurations entry by entry (what 1.4.0 did)

It worked, at the price of ownership records in the manifest and a
merge module for every file shape. Removed in 2.0 with the files it
merged.

## History

- 2026-10-14, 6c2d3fc: decided (1.4.0), with entry-level merge of the
  hook and MCP files and a printed `.codex/config.toml` block.
- 2026-10-22, 8a92564: the merge rules removed; a file the harness does
  not own is left untouched.
- 2026-10-22, c45b319: engine settings no longer written at all.
