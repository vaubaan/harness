---
tracks:
  - src/render.ts
  - src/renderers/common.ts
  - src/renderers/claude-code.ts
  - src/renderers/codex-cli.ts
  - src/renderers/opencode.ts
  - src/renderers/index.ts
  - src/parser/schemas.ts
  - src/parser/common.ts
  - src/parser/skill.ts
  - src/parser/cmd.ts
last_reviewed: 2026-10-22
---

# Renderer pipeline

How a pivot file `*.skill.md` / `*.cmd.md` becomes a tree of native files
ready to be consumed by claude-code, codex-cli or opencode.

## Overview

Three stages, three code areas:

```
parse (src/parser/) → render (src/render.ts + src/renderers/) → write (src/cli/init.ts)
```

Everything is pure until the writes in the CLI: `render()` does not touch
the disk, which makes the tests fast and deterministic.

The harness ships no agent persona and no engine hook: only the doc
skills, their slash commands, and the engine-neutral umbrella. Decisions:
[no personas, no code judgment](../decisions/no-personas-no-code-judgment.md),
[lint in CI and pre-commit](../decisions/lint-in-ci-and-pre-commit.md).

## 1. Parse — from markdown to the pivot format

Each type has its Zod schema in `src/parser/schemas.ts`:

- `SkillFrontmatterSchema` — `id`, `description`, `engines?[]`,
  `requires?[]`, `tags?[]`
- `CmdFrontmatterSchema` — `id`, `trigger`
  (regex `/^\/[a-z][a-z0-9-]*$/`), `invokes_skill`, `args?`, `description`

Both schemas are `.strict()`: an unknown field is a parse error. The
generic factory `parseWithSchema<T>` (`src/parser/common.ts`) applies
`gray-matter` to split frontmatter and body, validates via Zod, and
otherwise throws `ParseError` (with the list of `ZodIssue`s). The
functions `parseSkill` / `parseCmd` are typed wrappers.

The result is a `ParsedFile<T>` (`src/parser/common.ts`): `{ meta, body, sourcePath }`.

## 2. Render — pure orchestrator

`render(input: RenderInput): RenderOutput` (`src/render.ts`) composes
the pipeline. `RenderInput` takes
`{ harness, engines, overrides?, projectSkills?, hasQualityDoc? }`. The
`harness` is `{ skills, cmds }`.

1. **Guard** — an empty `engines` list → `RenderError`. The engine choice
   is mandatory upstream as well (`resolveEngineList`,
   `src/cli/plan-render.ts`).
2. **Apply overrides** — merge of the project skills, then `applyOverrides()`
   merges stock + `overrides.add` and removes the ids listed in
   `overrides.disable`. See the `overrides-loading` entry.
3. **Loop over the engines** — OpenCode is processed last; for each engine:
   - Render all skills (`engines:` / `requires:` filtering handled by
     the per-engine renderer, see `capabilities-matrix`).
   - Render all cmds whose target skill (`invokes_skill`) was rendered
     on this engine.
   - Remember which skills/cmds were actually exposed (on at
     least one engine) for the umbrella.
4. **Emit the root files**:
   - Engine-neutral `AGENTS.md` (`buildUmbrellaBody`,
     `src/renderers/common.ts`), four sections: **Project map** (the doc
     pillars, plus `docs/skills/` and `docs/quality/code-quality.md` when
     present), **Doc-first** (the one working rule the harness imposes),
     **Checks** (run `npx @vaubaan/harness lint` before committing, CI
     runs it too; the generated files are committed and never edited by
     hand, re-run `update .` instead), and **Doc-skills** (one line per
     exposed skill with its slash command). The domain context (what the
     project does) lives in `README.md` and `docs/` of the target repo,
     not in the umbrella.
   - `CLAUDE.md` **only** if `claude-code` is in `engines`,
     reduced to the `@AGENTS.md` import (`CLAUDE_MD_STUB`).

Signature: `RenderOutput = { files: RenderedFile[], warnings: string[] }`.
A `render()` on the 3 engines produces the umbrella, `CLAUDE.md`,
8 skills on claude-code and codex-cli (OpenCode reuses them), and
8 commands on claude-code and opencode.

## 3. Per-engine renderers

Selected by `getRenderer(engine)` (`src/renderers/index.ts`) from
the `RENDERERS` record. All implement the `Renderer` interface
(`src/renderers/common.ts`): `renderSkill`, `renderCmd`. No agent,
hook, MCP or settings file is rendered
([no MCP, no code merge](../decisions/no-mcp-no-code-merge.md)).

### Native paths

| Engine        | Skill                            | Cmd                           | Root                                  |
|---------------|----------------------------------|-------------------------------|---------------------------------------|
| `claude-code` | `.claude/skills/<id>/SKILL.md`   | `.claude/commands/<id>.md`    | `AGENTS.md` **+** `CLAUDE.md` (`@AGENTS.md`) |
| `codex-cli`   | `.agents/skills/<id>/SKILL.md`   | — (custom prompts deprecated) | `AGENTS.md`                           |
| `opencode`    | `.opencode/skills/<id>/SKILL.md` | `.opencode/commands/<id>.md`  | `AGENTS.md`                           |

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

- `yamlFrontmatter(data)` — used by all three engines, `---` delimiters.
  There is no TOML helper any more: Codex agents were the only TOML
  output.
- `frontmatterDataForSkill` emits `name` + `description` (+ `tags`), per
  the Agent Skills spec: `name` must match the directory name.
- `frontmatterDataForCmd` emits `id`, `trigger`, `description` and the
  typed `args`. OpenCode keeps only `description`: it names the command
  after the file.

`engines` and `requires` are **not** propagated to the output. They are
build-time constraints, not runtime ones.

### Capability gating

Each `renderSkill` calls `isSkillEngineAllowed` then `checkSkillCapabilities`
(`src/renderers/common.ts`). A skill can be: allowed nominally, allowed
with a degradation warning, or skipped (blocking warning + `files: []`).
A skipped skill drops its command with it, since `render()` only renders
a cmd whose `invokes_skill` was rendered on that engine. Details in
[capabilities matrix](./capabilities-matrix.md).

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

The CLI adds writing, file tracking and conflict detection in
`src/cli/init.ts` and `src/cli/update.ts` (see the
[file lifecycle](./uninstall.md) handbook). The same `render()` is what
`lint:generated-fresh` replays to check that the committed files are
current ([linters architecture](./linters-architecture.md)).

## Debug

- **A file is missing?** Check `engines:` and `requires:`; OpenCode
  may also reuse the copy rendered for Claude Code or Codex.
- **A cmd disappears?** Codex renders none. On the other engines,
  check that the target skill (`invokes_skill`) was actually kept.
- **Broken frontmatter in the output?** All three engines use
  `yamlFrontmatter`; the `yaml` library quotes what needs quoting.

## Pitfalls

- Order is guaranteed **per engine**: skills first (in the order of
  `harness.skills`), then cmds. Across engines, the order follows
  `engines:` except for OpenCode, moved last by `opencodeLast`.
  `AGENTS.md` and `CLAUDE.md` are emitted last.
- `applyOverrides` uses `Map.set`, so **the override wins on id collision**.
- `CLAUDE.md` is hard-coded in `src/render.ts` (`CLAUDE_MD_STUB`): a
  single `@AGENTS.md` line, emitted only if claude-code is in
  `engines`.
