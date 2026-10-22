---
title: No MCP rendering, no code-driven merge of shared configuration
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# No MCP rendering, no code-driven merge of shared configuration

## Context

The harness has one job: keep a project's context alive and make every
coding agent follow it. Two features drifted away from that job.

**MCP rendering.** From 0.5 to 1.4, `init --with-mcp=context7` wrote an
MCP server into three engine files (`.mcp.json`, `.codex/config.toml`,
`.opencode/opencode.json`). An MCP server is a tool the project
chooses, not a piece of information the harness maintains. The only
server shipped, context7, is not in our domain.

**Code-driven merge.** Because those files, and the engine settings
holding the Stop hook, are shared with the project, 1.x merged them
entry by entry: parsed JSON, matched hook commands, migrated a legacy
OpenCode file, recorded entry ownership in the manifest and reversed it
on `uninstall`. About 900 lines of code and 600 lines of tests trying
to predict every shape a user's configuration can take, and a new case
with each engine release. The design session of 2026-10-22 settled the
principle: **the CLI does what is mechanical and says what is left;
judgment belongs to the agent and the human.** Merging two
configurations is judgment.

## Decision

1. **No MCP support.** The `--with-mcp` option, the server registry,
   `renderMcp` and every MCP file are gone. The harness never reads,
   writes or lists an MCP configuration. A project that wants context7
   adds it to its own configuration.
2. **No merge by code.** The harness writes a file only when it is
   absent, or when the manifest records it with a hash that still
   matches. A file it does not own is left byte-for-byte untouched.
3. **Released paths.** `.mcp.json`, `.codex/config.toml`,
   `.opencode/opencode.json`, the legacy `.opencode/mcp.json`,
   `.claude/settings.json` and `.codex/hooks.json` are no longer
   managed locations. A manifest that still lists one drops it with a
   warning; the file stays in place as the project's. Entry ownership
   recorded by 1.x is ignored when the manifest is read.
4. **`.mcp.json` leaves `lint:gitignore-harness`.** Whether it is
   committed is the project's choice.

Since the Stop hook was removed the same day
([lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md)), no
engine settings file is written at all; there is nothing left to merge
or to print.

## Consequences

- The installation planner has one rule, applied to every generated
  file: conflicts stop the run, `--preserve` hands a file to the
  project ([safe-init](./safe-init.md)).
- Installations made with 1.x keep working. `update` warns once about
  the released files; nothing is deleted. The MCP entries 1.x added
  remain in the project's files, as the project's own entries.
- Breaking change, shipped in 2.0: `--with-mcp` disappears.

## Rejected alternatives

### Keep MCP rendering but stop merging

Without merge, an MCP file could only be written when absent, which is
the rare case: every engine user already has one. The feature would
exist mostly to print a snippet. Not worth a registry.

### Keep a minimal merge for structured files

JSON and TOML are structured, so adding an absent key is safe. The
question is not whether the merge is safe, it is whether the harness
should decide what the result looks like. Any merge keeps the ownership
records, the cleanup on uninstall and the tests for every shape. All or
nothing; we chose nothing.

### Refuse to run when a shared file exists

It turns a routine case, a project with its own settings, into a
blocking error. Leaving the file alone is the same safety without the
stop.

### Enable context7 by default (rejected in 2026)

It would have made every engine boot heavier and imposed an external
dependency on every harnessed project; the opt-in was the middle
ground until the feature itself left.

## History

- 2026-05-31: opt-in `--with-mcp=context7`, one MCP file per engine in
  its native convention (decision `mcp-rendering-opt-in`).
- 2026-09-20: the OpenCode MCP file corrected to
  `.opencode/opencode.json` (1.0.0); entry-level ownership of OpenCode
  entries (1.0.1).
- 2026-10-14: `init` merged `.mcp.json` and the hook files entry by
  entry (1.4.0).
- 2026-10-22, 8a92564: MCP rendering and code merge removed.
- 2026-10-22, c45b319: the hook files join the released paths.
