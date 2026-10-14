# MCP servers: opt-in rendering, one file per engine

**Date:** 2026-05-31
**Status:** accepted
**Author:** Vaubaan core

> **1.0.0 update (2026-09-20)**: opencode's MCP file is
> `.opencode/opencode.json` (not `.opencode/mcp.json`, which is never read) —
> see [_engine-native-layouts-1-0_](./engine-native-layouts-1-0.md).

## Context

The harness renders engine-native skills, commands and agents, but until now
did not touch any **MCP server** on the engine side. The `coding` and
`planning` personas therefore had no way to fetch up-to-date
docs for an external library — they code or plan from memory,
with the usual cost: invented signatures, outdated APIs, ADRs
based on a state of the ecosystem that no longer exists.

[Upstash Context7](https://github.com/upstash/context7) fills
exactly this gap: it is an MCP server that exposes
`resolve-library-id` + `get-library-docs`, launched via
`npx -y @upstash/context7-mcp`. The user flagged it as a
must-have for the harness on 2026-05-31.

Three questions to settle:

1. **Enable by default or opt-in**? Enabling by default makes the
   engine boot heavier (npx + network) and imposes a non-Vaubaan external dependency
   on every harnessed project, including those that do not touch
   external libs (CI tooling, doc-only repos, etc.).
2. **Where to put the config file**? Each engine has its own native
   convention (root `.mcp.json` for claude-code, `[mcp_servers.<id>]`
   in `.codex/config.toml` for codex-cli, `mcp` field in
   `.opencode/mcp.json` for opencode).
3. **How to tell the personas they can use it**?

## Decision

**Opt-in rendering via `--with-mcp=<list>`**. `init` and `render` accept
a `--with-mcp=context7[,...]` flag. Without the flag, no MCP file
is emitted (state unchanged from v0.4). With the flag, **one
file per selected engine** is produced, in the native
convention:

| Engine        | Rendered file             | Format                         |
|---------------|---------------------------|--------------------------------|
| `claude-code` | `.mcp.json` (root)        | JSON, `mcpServers.<id>`        |
| `codex-cli`   | `.codex/config.toml`      | TOML, `[mcp_servers.<id>]`     |
| `opencode`    | `.opencode/mcp.json`      | JSON, `mcp.<id>` (`type: local`) |

The registry of known MCP servers lives in `src/mcp.ts`
(`MCP_SERVERS: Record<McpServerId, McpServerSpec>`), extensible — v1
exposes only `context7`. Each renderer exposes
`renderMcp(servers)` (see [ADR _multi-engine-pivot-format_](./multi-engine-pivot-format.md))
which returns `[]` when the list is empty, making the absence of the
flag a free no-op in the pipeline.

The `coding` and `planning` personas get an explicit paragraph
("**MCP: up-to-date library docs if `context7` is configured**")
stating **when** and **how** to call the
`resolve-library-id` / `get-library-docs` tools. It is conditional ("if
configured") because rendering is opt-in: the persona cannot
assume the server is active.

The `lint:gitignore-harness` linter adds `.mcp.json` to the list of
required entries — even consumers who do not opt in must
gitignore this file, for consistency with
[ADR _claude-md-stub-back-compat_](./claude-md-stub-back-compat.md)
(every artifact rendered at the root is gitignored, regardless of whether it
is actually emitted in the current session).

## Consequences

**Benefits**:

- The `coding` and `planning` personas can ground their work in
  the **actual current API surface** of libraries, rather than in
  outdated memories. Direct benefit: fewer ADRs based on
  phantom signatures, fewer latent bugs.
- Opt-in protects projects that have no network connection at
  engine boot or that do not want to depend on the Upstash
  ecosystem. No breaking change: v0.4 → v0.5 changes nothing for
  existing consumers as long as they do not add
  `--with-mcp`.
- The pivot format is unchanged — MCP is a **rendering** layer,
  not a **source** layer. No `*.mcp.md` to invent.
- Free extensibility: adding a future MCP server (deepwiki,
  filesystem, etc.) requires one entry in `MCP_SERVERS`; the
  per-engine renderers are already generic.

**To accept**:

- A consumer who opts in must make sure `npx` is available
  in their engine environment — the harness does not validate that
  the runtime launch is feasible.
- Upstream `context7-mcp` claims are opaque: if Upstash
  changes the binary's signature or breaks the public API, we must
  bump the version in `MCP_SERVERS.context7`. This is an external
  maintenance cost, accepted in exchange for the main gain.
- Adding `.mcp.json` to `lint:gitignore-harness` is a mini-break
  for existing consumers — one line to add to
  `.gitignore`, flagged by the linter at the next CI run.

## Rejected alternatives

- **Enable `context7` by default** — rejected: makes the boot of
  every harnessed project heavier, imposes a non-Vaubaan external dependency,
  and implicitly excludes environments without network at boot.
  Opt-in preserves optionality.
- **A `library-docs` skill wrapping context7** — rejected: context7
  does not **write** docs (the role of the doc-skills writers), it
  **reads** them. Confusing it with a skill blurs the separation between skills
  (LLM-driven, judgment) and MCP (tool-driven, lookup) settled by
  [ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md).
- **Centralize all MCPs in a single engine-neutral file such as
  `.harness/mcp.json`** — rejected: no engine reads it
  natively; it would require a runtime loader on each engine's side. Per-engine
  rendering respects each tool's native convention,
  consistent with [ADR _multi-engine-pivot-format_](./multi-engine-pivot-format.md).
- **Let consumers configure their MCP themselves** — rejected:
  that is the pre-decision state. The harness exists precisely to
  ship a ready-to-use operational config; making the effort for
  skills/commands/agents and dropping it for MCP servers
  would be inconsistent.
- **Emit the 3 MCP files even without the flag (empty / commented file)** —
  rejected: a `.mcp.json` file containing `{"mcpServers": {}}` at the root
  is a visual trap ("looks like it is configured, but actually
  it is not"). Better: no file = no ambiguity.

## References

- [Spec §4.3 — multi-engine layout](../spec/coding-agent-harness.md)
- [ADR _multi-engine-pivot-format_](./multi-engine-pivot-format.md) —
  the per-engine renderers share a common signature; we extend
  the interface with `renderMcp(servers)`.
- [ADR _multi-agent-multi-engine-default_](./multi-agent-multi-engine-default.md) —
  same principle of opt-out via flag, never opt-in via flag (except
  in cases like MCP, justified by an external dependency).
- [Upstash Context7](https://github.com/upstash/context7) — upstream
  source of the chosen MCP server.
