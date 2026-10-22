---
tracks:
  - src/render.ts
  - src/renderers/common.ts
  - src/renderers/claude-code.ts
  - src/renderers/codex-cli.ts
  - src/renderers/opencode.ts
  - src/renderers/opencode-hook.test.ts
  - src/renderers/index.ts
  - src/parser/schemas.ts
  - src/parser/common.ts
  - src/parser/agent.ts
  - src/parser/skill.ts
  - src/parser/cmd.ts
last_reviewed: 2026-10-14
---

# Renderer pipeline

How a pivot file `*.skill.md` / `*.cmd.md` / `*.agent.md` becomes
a tree of native files ready to be consumed by claude-code, codex-cli
or opencode.

## Overview

Three stages, three code areas:

```
parse (src/parser/) → render (src/render.ts + src/renderers/) → write (src/cli/init.ts)
```

Everything is pure until the `writeFileSync` in the CLI: `render()` does not touch
the disk, which makes the tests fast and deterministic.

## 1. Parse — from markdown to the pivot format

Each type has its Zod schema in `src/parser/schemas.ts`:

- `SkillFrontmatterSchema` — `id`, `description`, `engines?[]`,
  `requires?[]`, `tags?[]`
- `CmdFrontmatterSchema` — `id`, `trigger`
  (regex `/^\/[a-z][a-z0-9-]*$/`), `invokes_skill`, `args?`, `description`
- `AgentFrontmatterSchema` — `id` (∈ AGENT_IDS), `description`

The generic factory `parseWithSchema<T>` (`src/parser/common.ts:12-27`)
applies `gray-matter` to split frontmatter and body, validates via Zod,
and otherwise throws `ParseError` (with the list of `ZodIssue`s). The three functions
`parseAgent` / `parseSkill` / `parseCmd` are just typed wrappers.

The result is a `ParsedFile<T>` (`src/parser/common.ts:6-10`): `{ meta, body, sourcePath }`.

## 2. Render — pure orchestrator

`render(input: RenderInput): RenderOutput` (`src/render.ts`) composes
the pipeline. `RenderInput` takes
`{ harness, engines, overrides?, projectSkills?, hasQualityDoc?, withStopHook? }` — **no**
per-agent selection: all the harness personas are rendered, for
each requested engine. See the ADR
[multi-agent-multi-engine-default](../decisions/multi-agent-multi-engine-default.md)
for the why.

1. **Guards** — no engine or no agent after overrides
   → `RenderError`.
2. **Apply overrides** — merge of the project skills, then `applyOverrides()` merges stock + `overrides.add`
   then removes the ids listed in `overrides.disable`. See also
   the `overrides-loading` entry.
3. **Loop over the engines** — OpenCode is processed last; for each engine:
   - Render all skills (`engines:` / `requires:` filtering handled by
     the per-engine renderer, see `capabilities-matrix`).
   - Render all cmds whose target skill (`invokes_skill`) was
     rendered.
   - Render **all agents**: `renderer.renderAgents(harness.agents)`
     emits one subagent per persona in the native paths of the table
     below (`.toml` for Codex, `.md` for the other two).
   - Remember which skills/cmds were actually exposed (on at
     least one engine) for the umbrella.
   - Render the Stop hook, enabled by default.
4. **Emit the root files**:
   - Engine-neutral `AGENTS.md`: **how we work** (project map
     + doc-first principle) followed by the exposed skills/commands
     (`buildUmbrellaBody`, `src/renderers/common.ts`). The
     domain context (what the project does) lives in `README.md` and
     `docs/` of the target repo, not in the umbrella; the list of personas
     is harness metadata, it is not injected into the
     system prompt.
   - `CLAUDE.md` **only** if `claude-code` is in `engines`,
     reduced to the `@AGENTS.md` import.

Signature: `RenderOutput = { files: RenderedFile[], warnings: string[] }`
(`src/render.ts:36-39`). Multi-file by construction: a `render()`
on the 3 engines produces about fifty files (the umbrella +
4 subagents×3 + 9 skills×2 + 9 commands×2 + hooks + `CLAUDE.md`).

## 3. Per-engine renderers

Selected by `getRenderer(engine)` (`src/renderers/index.ts:13-15`) from
the `RENDERERS` record. All implement the `Renderer` interface
(`src/renderers/common.ts`): `renderSkill`, `renderCmd`, `renderAgents`,
`renderStopHook`. No MCP configuration is rendered
([decision](../decisions/no-mcp-no-code-merge.md)).

### Native paths

| Engine        | Skill                                   | Cmd                              | Agents                                                                                  |
|---------------|-----------------------------------------|----------------------------------|-----------------------------------------------------------------------------------------|
| `claude-code` | `.claude/skills/<id>/SKILL.md`          | `.claude/commands/<id>.md`       | `AGENTS.md` (umbrella) **+** `.claude/agents/<id>.md` × 4 **+** `CLAUDE.md` (`@AGENTS.md`) |
| `codex-cli`   | `.agents/skills/<id>/SKILL.md`          | — (custom prompts deprecated)    | `AGENTS.md` (umbrella) **+** `.codex/agents/<id>.toml` × 4                              |
| `opencode`    | `.opencode/skills/<id>/SKILL.md`        | `.opencode/commands/<id>.md`     | `AGENTS.md` (umbrella) **+** `.opencode/agents/<id>.md` × 4                              |

OpenCode also reads `.claude/skills/` and `.agents/skills/`. `render()`
therefore processes `opencode` last (`opencodeLast`, `src/render.ts`) and
**omits** its copy of a skill already exposed by another rendered engine.
Layout decision: ADR
[engine-native-layouts-1-0](../decisions/engine-native-layouts-1-0.md).
The level of runtime validation per engine is detailed in the
[verified findings](../research/2026-09-20-conformite-engines-verifiee.md).

See `src/renderers/claude-code.ts`, `src/renderers/codex-cli.ts`,
`src/renderers/opencode.ts`.

### Frontmatter

Shared helpers in `src/renderers/common.ts`:

- `yamlFrontmatter(data)` — used by all three engines, `---` delimiters
- `tomlMultilineString`, `tomlQuoteString`, `tomlInlineArray`,
  `tomlInlineTable` — reserved for Codex (`.codex/agents/<id>.toml`,
  `.codex/config.toml`)

The helpers `frontmatterDataForSkill` (emits `name` + `description`,
per the Agent Skills spec) and `frontmatterDataForCmd`
extract the subset of fields to emit (note: `engines` and `requires` are
**not** propagated to the output — they are build-time constraints, not
runtime ones).

### Capability gating

Each `renderSkill` calls `isSkillEngineAllowed` then `checkSkillCapabilities`
(`src/renderers/common.ts:42-60`) — details in handbook 02. A skill
can be: allowed nominally, allowed with a degradation warning,
or skipped (blockingWarning + `files: []`).

### Agent body

`buildAgentBody(agent)` renders the agent's markdown as is. The
personas no longer list skills or commands: the engines discover them
natively, and the single list lives in `AGENTS.md` (the
"Doc-skills" section).

### OpenCode hook continuation

The [Stop hooks handbook](./stop-hook.md) describes the shared decision,
the local retry state and the adapters' responses.

`renderStopHook` in `src/renderers/opencode.ts` emits
`.opencode/plugins/harness-stop-hook.ts`, a single default export that
OpenCode 1.x and 2.x both load (decision:
[one plugin for V1 and V2](../decisions/opencode-v1-v2-stop-hook-plugin.md)):

```js
export default { id: "vaubaan-harness-stop-hook", server, setup };
```

Both entry points react to `session.idle`, run `npx -y @vaubaan/harness
stop-hook --engine opencode` through the shared `lintReport` helper, and
only continue the session if the process returns exit code 2 with a
non-empty report on stderr.

**OpenCode 1.x** calls `server({ client, directory })`, which returns an
`event` handler. The handler reads `client.session.messages` and searches backward for the last
user or assistant message carrying a non-empty `agent`. Internal
compaction summaries are ignored. It passes this agent in
`client.session.prompt({ path, body: { agent, parts } })`, with the
report as text. A user selection more recent than the last
assistant message therefore takes precedence. If the history is unavailable or the
persona is unknown, no continuation is sent with the default
agent. The decision is described in
[safe lifecycle](../decisions/safe-project-artifact-lifecycle.md).

**OpenCode 2.x** calls `setup(context)`. It iterates
`context.event.subscribe()` in the background, skips `session.idle`
events whose `location.directory` is another project, and sends the
report with `context.session.prompt({ sessionID, text })`. A 2.x session
keeps its agent, so no persona lookup is needed. `setup` returns a
cleanup that aborts the subscription.

`src/renderers/opencode-hook.test.ts` runs both entry points of the
generated module with mocks; the [E2E plan](../tests/e2e-tests.md) explicitly keeps
the limitation on a full loop with a real model.

## How to use it from code

```ts
import { loadHarness, render } from "@vaubaan/harness";

const harness = loadHarness("/path/to/package");
const { files, warnings } = render({
  harness,
  engines: ["claude-code", "codex-cli"],
});
for (const f of files) await fs.writeFile(join(out, f.path), f.content);
```

The CLI adds writing, file tracking and handling of shared
configurations in `src/cli/init.ts` (see the
[file lifecycle](./uninstall.md) handbook).

## Debug

- **A file is missing?** Check `engines:` and `requires:`; OpenCode
  may also reuse the copy rendered for Claude Code or Codex.
- **A cmd disappears?** Codex renders none. On the other engines,
  check that the target skill (`invokes_skill`) was actually kept.
- **Broken frontmatter in the output?** All three engines use
  `yamlFrontmatter`. The TOML helpers are only used for Codex agents.

## Pitfalls

- Order is guaranteed **per engine**: skills first (in the order of
  `harness.skills`), then cmds, then subagents. Across engines, the order
  follows `engines:` except for OpenCode, moved last by
  `opencodeLast`. AGENTS.md and CLAUDE.md are emitted last.
- `applyOverrides` uses `Map.set`, so **the override wins on id collision**.
- `CLAUDE.md` is hard-coded in `src/render.ts` (`CLAUDE_MD_STUB`): a
  single `@AGENTS.md` line, emitted only if claude-code is in
  `engines`.
