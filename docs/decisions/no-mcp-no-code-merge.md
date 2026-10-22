---
title: No MCP rendering, no code-driven merge of shared configuration
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# No MCP rendering, no code-driven merge of shared configuration

## Context

The harness has one job: keep a project's documentation alive and make
every coding agent follow it. Two features drifted away from that job.

**MCP rendering.** `init --with-mcp=context7` wrote an MCP server into
three engine files (`.mcp.json`, `.codex/config.toml`,
`.opencode/opencode.json`), see
[mcp-rendering-opt-in](./mcp-rendering-opt-in.md). An MCP server is a
tool the project chooses, not a piece of information the harness
maintains. The only server we shipped, context7, is not in our domain.

**Code-driven merge.** Because those files, and the Stop hook files
`.claude/settings.json` and `.codex/hooks.json`, are shared with the
project, 1.x merged them entry by entry: `src/cli/update-config.ts` and
`src/cli/opencode-config.ts` parsed JSON, matched hook commands,
migrated a legacy OpenCode file, recorded entry ownership in the
manifest (`hookConfigs`, `opencodeConfig`, `mcpConfig`) and reversed it
on `uninstall`. That is about 900 lines of code and 600 lines of tests
trying to predict every shape a user's configuration can take. Each
engine release adds a case. The design session of 2026-10-22 settled
the principle: **the CLI does what is mechanical and says what is left;
judgment belongs to the agent and the human.** Merging two
configurations is judgment.

## Decision

1. **No MCP support.** The `--with-mcp` option, the `src/mcp.ts`
   registry, `renderMcp` on the renderers and every MCP file are
   removed. The harness never reads, writes or lists an MCP
   configuration. A project that wants context7 adds it to its own
   configuration.

2. **No merge by code.** The harness writes a shared file only when it
   is absent, or when the manifest records the file with a hash that
   still matches, in which case the file is a generated file like any
   other. An existing file the harness does not own is left
   byte-for-byte untouched. For the Stop hook files, the CLI then prints
   the exact block to add, so the agent or the human merges it with
   full knowledge of what is already there. A file that already
   contains the harness Stop hook command is reported as such and stays
   the project's.

3. **Hook files are ordinary generated files.** `.claude/settings.json`
   and `.codex/hooks.json` appear in the manifest's `files` with a hash
   when the harness wrote them. `uninstall` removes them under the
   general rule: unchanged since written. The OpenCode plugin was
   already handled this way.

4. **Files 1.x edited are released to the project.** `.mcp.json`,
   `.codex/config.toml`, `.opencode/opencode.json` and the legacy
   `.opencode/mcp.json` are no longer managed locations. A manifest that
   still lists one of them drops it with a warning; the file stays in
   place. Entry ownership recorded by 1.x (`hookConfigs`,
   `opencodeConfig`, `mcpConfig`) is ignored when the manifest is read.
   A Stop hook entry 1.x merged into a user file is now the user's;
   the CLI detects it by its command and does not ask for it again.

5. **`--preserve` applies to hook files too.** The distinction between
   generated artifacts and shared configurations disappears.

6. **`.mcp.json` leaves `lint:gitignore-harness`.** The harness no
   longer writes it; whether it is committed is the project's choice.

## Consequences

- The installation planner loses the shared-configuration branch:
  `update-config.ts`, `opencode-config.ts` and their tests are deleted.
  What remains is one rule, applied to every generated file.
- A project whose `.claude/settings.json` predates the harness does not
  get the Stop hook installed by `init`. The warning carries the block
  to add; the agent adds it. This is the trade: one manual step, no
  merge code.
- Installations made with 1.x keep working. `update` warns once about
  the released files and the hook entries it no longer owns; nothing is
  deleted. The MCP entries 1.x added remain in the project's files, as
  the project's own entries.
- This is a breaking change: `--with-mcp` disappears, `init` no longer
  edits an existing `.claude/settings.json`. It ships in 2.0.
- [safe-init](./safe-init.md), [project-update-migrations](./project-update-migrations.md)
  and [safe-project-artifact-lifecycle](./safe-project-artifact-lifecycle.md)
  are amended: their rules on shared configurations no longer apply;
  their rules on generated files, conflicts, transactions and backups
  stand.

## Rejected alternatives

### Keep MCP rendering but stop merging

Without merge, an MCP file could only be written when absent, which is
the rare case: every engine user already has one. The feature would
exist mostly to print a snippet. Not worth a registry.

### Keep a minimal merge for structured files

JSON and TOML are structured, so adding an absent key is safe. True,
but the question is not whether the merge is safe, it is whether the
harness should decide what the result looks like. Keeping any merge
keeps the ownership records, the cleanup on uninstall and the tests for
every shape. All or nothing; we chose nothing.

### Render the Stop hook into a harness-owned file and have the engine
include it

Neither Claude Code nor Codex includes a second settings file from the
project directory. The shared file is the only place.

### Refuse to run when a shared file exists

It turns a routine case, a project with its own settings, into a
blocking error. Leaving the file alone and printing the block is the
same safety without the stop.
