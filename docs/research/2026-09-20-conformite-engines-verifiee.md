# Render conformance to engines — verified findings (20 September 2026)

Complements an internal technology watch from the same day.
Each line below was checked against the engine's official documentation
on 2026-09-20, not inferred. This document feeds the ADR
[_engine-native-layouts-1-0_](../decisions/engine-native-layouts-1-0.md).

## Corrections to the watch brief

- **Item 4 of the brief ("`lint:harness` neither in a hook nor in CI")**: false for
  this repo. `npm run ci` includes `lint:harness` and runs in
  `.github/workflows/ci.yml` and in `.husky/pre-commit`, and the Stop hook is
  rendered by default. The real gap is on the **consumer** side: the harness
  provides it with no ready-to-use CI job.
- **Axis 2 of the brief ("render skills only once under
  `.agents/skills/`")**: impossible as stated. Claude Code does **not** read
  `.agents/` ("Not read: […] anything under a `.agents/` directory").

## Where each engine discovers what

| Artifact | claude-code | codex-cli | opencode |
|---|---|---|---|
| Skills | `.claude/skills/<id>/SKILL.md` only | `.agents/skills/<id>/SKILL.md` only (`.codex/skills/` is no longer a discovery location) | `.opencode/skills/`, `.claude/skills/` **and** `.agents/skills/` (`<id>/SKILL.md`) |
| Frontmatter | YAML | YAML | **YAML** (agents, commands, skills) |
| Subagents | `.claude/agents/<id>.md` (YAML `name`, `description`) | `.codex/agents/<id>.toml` (`name`, `description`, `developer_instructions`) | `.opencode/agents/<id>.md` (YAML `description`, `mode`); the name comes from the file |
| Commands | `.claude/commands/<id>.md` (legacy, still read) | custom prompts **deprecated** in favour of skills | `.opencode/commands/<id>.md` (YAML `description`, `agent`, `subtask`); `$ARGUMENTS` |
| Project MCP | `.mcp.json` | `.codex/config.toml` `[mcp_servers.<id>]`, approved ("trusted") project required | `opencode.json` key `mcp` (`type: "local"`, `command: [...]`, `environment`) |
| End-of-turn hook | `.claude/settings.json` `hooks.Stop[].hooks[]` | `.codex/hooks.json` `hooks.Stop[].hooks[]` (enabled by default; `matcher` ignored); continuation via `{decision:"block",reason}` or exit 2 + stderr | JS/TS plugin `.opencode/plugins/*.ts`, exported function `async ({client,…}) => ({ event })`, `session.idle` event |
| Instructions | `CLAUDE.md`; `AGENTS.md` read natively since 2.1.277 **only if there is no `CLAUDE.md`** and not on Bedrock/Vertex/with telemetry disabled | `AGENTS.md` | `AGENTS.md` |

## Gaps in the 0.9.0 render

1. **codex-cli / skills**: rendered flat as `.codex/skills/<id>.md` → not discovered.
2. **codex-cli / agents**: rendered as YAML Markdown → Codex expects TOML.
3. **codex-cli / commands**: `.codex/commands/` is read by nothing.
4. **codex-cli / hooks**: `Stop: [{type, command}]` without the `hooks: [...]` level.
5. **opencode / skills**: rendered as `.opencode/plugins/<id>/index.md`; `plugins/` only loads JS/TS modules → not discovered.
6. **opencode / frontmatter**: TOML `+++` whereas OpenCode reads YAML `---` → agent and command frontmatter ignored.
7. **opencode / MCP**: `.opencode/mcp.json` is not read; it is `opencode.json`.
8. **opencode / stop hook**: `export default { hooks: { stop } }` does not match the plugin API.
9. **claude-code / `CLAUDE.md`**: the "in words" stub is the pattern the docs advise against ("Claude sees `AGENTS.md` only if it decides to open the file"); the recommended pattern is the `@AGENTS.md` import.
10. **All engines**: skill frontmatter with `id:` whereas the Agent Skills spec requires `name:`.

## Codex cross-check in a live session

On 2026-09-20, Codex CLI **0.154.0** was exercised against the 1.0.0
render (`e070216`). The checks distinguish discovery from execution:

- **TOML agent: confirmed.** A `spawn_agent` of type `coding` started
  a subagent carrying the `coding` role. Its developer instructions
  matched exactly the `developer_instructions` content of the
  rendered file `.codex/agents/coding.toml`. The subagent returned the
  requested marker `CUSTOM_CODING_AGENT_OK`.
- **Project MCP: confirmed in a trusted project.** `config/read`
  exposes the `context7` server from `.codex/config.toml` and
  `codex mcp list --json` lists it. In a live session, the tools
  `mcp__context7__query_docs` and `mcp__context7__resolve_library_id`
  were available; no functional call to these tools was made.
- **Unapproved project: configuration disabled.** In the temporary
  untrusted fixture, `config/read` returns a `disabledReason`
  asking for the project to be approved in the user configuration.
  This behavior is consistent with the first `codex mcp list` of the
  Claude session, which found no server: that first attempt did not
  validate loading of the project MCP.

The conclusive check uses a persisted session in a repo that was
already approved; the user's global configuration was not modified.
The first attempt with `codex exec --ephemeral` failed at fork with
`no thread with id`; it does not validate spawning in ephemeral mode.
No full LLM → lint hook → LLM cycle was validated by this smoke test.

Local audit evidence:
`.vaubaan/reports/engine-native-evidence/codex-runtime.json` and
`codex-live.jsonl` (session artifacts, not distributed with the package).
The [E2E plan](../tests/e2e-tests.md) details the manual scope and the
scenarios still to be automated.

## OpenCode 1.0.1 hook cross-check

On OpenCode and `@opencode-ai/sdk` **1.14.50**, the fixed plugin was
run against the real `session.messages` and `session.prompt` APIs.
For two sessions, `review` and `planning` respectively, the agent
passed by the plugin and then recorded by OpenCode stayed identical
to the initial persona.

The lint process result was simulated to trigger the continuation,
and the verification call used `noReply: true` to avoid a model
response. This test confirms persona preservation through the real
SDK and API; it does not validate a full LLM → lint → LLM cycle. The
automated scenarios for the emitted module separately cover missing
histories, errors and compaction summaries.

## Sources

- https://code.claude.com/docs/en/memory (AGENTS.md section)
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/changelog (v2.1.277)
- https://learn.chatgpt.com/docs/build-skills
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://learn.chatgpt.com/docs/hooks
- https://developers.openai.com/codex/custom-prompts
- https://opencode.ai/docs/skills/ · /agents/ · /commands/ · /plugins/ · /mcp-servers/
