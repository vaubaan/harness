# Engine conformance re-check (14 October 2026)

Follow-up to [the 20 September check](./2026-09-20-conformite-engines-verifiee.md),
against Claude Code 2.1.299, Codex 0.155.1 (upstream latest 0.162.1) and
OpenCode 1.14.50 (latest 1.x: 1.19.0; 2.0.29 also tested). Each item was
checked against official docs or release notes and, without calling a
model, against the installed CLIs on a freshly rendered project.

## Summary

| Engine | Verdict | Action |
|---|---|---|
| Claude Code | No breaking change. Rendered `.claude/`, `CLAUDE.md`, `.mcp.json` and the Stop hook protocol still match the docs (`claude doctor`, `claude plugin validate`, `claude mcp list`). | Docs only. |
| Codex | Formats unchanged up to 0.162.1. Missed on 20 September: project hooks only run after the project is trusted **and** the hook is approved. | Documented; `init` prints a reminder. |
| OpenCode 1.x | 1.14.50 → 1.19.0 is safe: plugin and SDK types unchanged on what the harness uses. | None. |
| OpenCode 2.x | Released 2026-09-12. Agents, skills, commands, MCP and `AGENTS.md` load. The Stop hook plugin failed to load. | Fixed in 1.3.2: [one plugin for V1 and V2](../decisions/opencode-v1-v2-stop-hook-plugin.md). |

## Claude Code

- Since 2.1.281, native `AGENTS.md` support also works on Bedrock, Vertex,
  Foundry, gateways and with telemetry disabled. The rendered `CLAUDE.md`
  containing `@AGENTS.md` remains the documented pattern and never makes
  Claude read `AGENTS.md` twice
  ([memory](https://code.claude.com/docs/en/memory#agents-md)).
- Custom commands are merged into skills; `.claude/commands/` "keeps
  working" ([skills](https://code.claude.com/docs/en/skills)). Moving
  commands to skills is optional.
- Stop hook input and the `{decision: "block", reason}` response are
  unchanged. Stderr from a hook that exits 0 is never shown, so the
  hook's "no progress" message is invisible
  ([hooks](https://code.claude.com/docs/en/hooks)).
- Interactive sessions hold back project hooks until the workspace trust
  dialog is accepted.

## Codex

- Non-managed hooks "must be reviewed and trusted before they run"
  ([hooks](https://learn.chatgpt.com/docs/hooks)). The app-server
  `hooks/list` call on a rendered, trusted project reports the harness
  Stop hook with `trustStatus: "untrusted"`; on an untrusted project it
  returns no hooks. `codex exec` skips untrusted hooks unless
  `--dangerously-bypass-hook-trust` is passed. This gate predates 0.154.0.
- Skills in `.agents/skills/`, agents in `.codex/agents/*.toml`,
  `AGENTS.md`, MCP in `.codex/config.toml` (trusted projects only) and the
  Stop payload/response are unchanged through 0.162.1.
- Codex docs moved from `developers.openai.com/codex` to
  `learn.chatgpt.com/docs`; old links redirect.

## OpenCode

- 2.0.29 rejected the 1.x plugin: "Plugin must export a default definition
  with an id and an effect or setup function". 2.x plugins export
  `{ id, setup(context) }`; events come from `context.event.subscribe()`
  as `{ type: "session.idle", data: { sessionID } }`; sessions are
  resumed with `context.session.prompt({ sessionID, text })` and keep
  their agent ([plugins](https://opencode.ai/v2/docs/build/plugins/),
  [migration](https://opencode.ai/v2/docs/build/plugins/migrate-v1/)).
- 1.14.50 rejects a module whose default export is not an object with
  `server()`. The 1.3.2 plugin therefore has one default export with
  `server` (1.x) and `setup` (2.x). Verified: 1.14.50 loads it without
  error; 2.0.29 lists it as `active`.
- 2.x auto-translates the 1.x MCP shape in `.opencode/opencode.json`,
  reads only `AGENTS.md` (no `CLAUDE.md` fallback), and lists
  `.opencode/opencode.json` as a project config location.

## Not verified

Full turns with a model (lint report injected, agent fixes the docs) on
any engine, and the Codex hook approval flow in the IDE extension.
