# Vaubaan harness — spec

> **Status:** stable, 2.0 contract (2026-10-22). The harness (`@vaubaan/harness`) *harnesses*
> a project directory so that a coding agent (claude-code /
> codex-cli / opencode) is immediately productive in it, and provides
> the skills that *keep alive* a project's **doc**
> (6 mandatory pillars: README.md at the root + spec + decisions +
> handbook + tests + workflow under `docs/`; 2 optional pillars:
> skills and quality, see §9.1.2).
>
> The harness is **standalone** — a simple package + companion CLI
> that drops doc skills, commands and an engine-neutral `AGENTS.md`
> into a target directory. No runtime dependency, no engine hook, no
> agent persona, no integration with any particular orchestrator: a
> human, the CI or a third-party script invokes `vaubaan harness init`.
> What persists in the project repo is the **doc** (6 pillars, see §9)
> plus the generated files, which are committed and checked against the
> current render by a linter (see §3.3). The harness imposes one working
> rule, doc-first; the team's own workflow is written in
> `docs/workflow/`, not supplied by the harness.
>
> **v2 lineage.** This spec replaces a previous codebase
> (**Vaubaan v2**, unpublished). From-scratch rewrite — no shared
> code, no migration, no compat. The spec is self-contained.

## 0. Vocabulary

The harness reasons with these words:

- **Harness** — the subsystem (a `@vaubaan/harness` package + a companion
  CLI `vaubaan harness ...`). No daemon, no runtime service;
  it is *configuration dropped into a target directory*.
- **Harness** — the set of agent configuration files placed
  in a target directory: `AGENTS.md` (global instructions),
  skills (capabilities), commands (slash-commands). Dropped by
  `vaubaan harness init` and committed (see §3.3).
- **Engine** — target coding agent: `claude-code | codex-cli |
  opencode`. Each has its own native skills/commands layout (see §4.3).
- **Skill** — reusable unit of capability. Pivot format
  `*.skill.md` (see §5); rendered per-engine at init time.
- **Command** — slash-command invocable by the human or the agent
  (`/doc-audit`, `/spec-writer`, …). Pivot format `*.cmd.md` (see §6).
- **Doc** — umbrella for the persistent artifacts supervised by the
  harness:
  - **README** (`README.md` at the root, outside `docs/`) — entry point
    of the repo: pitch, install, usage, links to the other pillars.
  - **spec** (theoretical vision, "what we want") — `docs/spec/`,
  - **decisions** (ADRs, "what we settled") — `docs/decisions/`,
  - **handbook** (implementation docs, "how it actually works") —
    `docs/handbook/`,
  - **tests** (test plans, "how we guarantee it works") —
    `docs/tests/`, two required files in v1:
    `integration-tests.md` and `e2e-tests.md`,
  - **workflow** (operational process, "how we work") —
    `docs/workflow/`, one required file in v1:
    `coding-workflow.md` (CI, prod/staging env variants, PR
    process or direct-push, branch logic, release / deploy
    logic).
- **Doc-skill** — cross-cutting doc-maintenance skill
  (`doc-audit`, `spec-writer`, `decision-record-writer`, `handbook-writer`,
  `test-plan-writer`, `workflow-writer`, `readme-writer`,
  `drift-detector`). Invocable by the agent or by the human via
  slash-command.
- **Override** — a project's local override of the dropped harness
  (adding/disabling/modifying a skill). **Gitignored** by
  design (see §11) — it is local customization, not harness
  versioning.
- **Doc-audit** — the harness's canonical skill that checks the
  completeness and freshness of the doc (see §10).

### 0.1 Position

`@vaubaan/harness` is a standalone package. No coupling to
a third-party service, no dependency on a session runtime.

Installation and update are explicitly invoked by the
user, their CI or their script. No automatic injection at
session start is promised. The project's checks cover
the harness and its documents, with no convention imposed by an
abandoned runtime. No engine hook is installed: the documentation
check runs in CI, in the project's git pre-commit hook and on demand
(`vaubaan harness lint`); no supervision signal is emitted. See
[the removal of CAR couplings](../decisions/retire-coding-agent-runner-coupling.md).

The flow is minimal:

```
@vaubaan/harness (npm)
        │
        │ npm install / npx -y
        ▼
CLI `vaubaan harness init <target-dir> --engines=<list>`
        │
        │ render skills + commands + the umbrella
        ▼
<target-dir>/
  AGENTS.md                ← umbrella: the working rule, the project map, the checks, the doc-skills
  CLAUDE.md                ← imports `@AGENTS.md` (claude-code only)
  .claude/skills/<id>/SKILL.md   (claude-code)
  .agents/skills/<id>/SKILL.md   (codex-cli — the only repo folder Codex scans)
  .opencode/skills/<id>/SKILL.md (opencode, if this skill is not already exposed by another engine)
  .<engine>/commands/<id>.md     (claude-code, opencode — no commands on the Codex side)
  .harness-manifest.json         ← what was written, committed with the rest
```

The harness does not touch secrets, does no network I/O, and
assumes nothing about the calling environment: it is a pure
transformation `(catalog, engines, overrides) → dropped files`. The
engine list is mandatory: nothing is rendered for a tool the project
does not use. The harness ships no agent persona: roles, phases and
the team's workflow are the project's, written in `docs/workflow/`.

## 1. Vision

The **harness** is the subsystem that:

1. **Standardizes** agent configuration across the 3 supported
   engines. The same `doc-audit.skill.md` is rendered into `.claude/skills/`,
   `.agents/skills/` (Codex), `.opencode/skills/`. The `*.skill.md` pivot format
   guarantees we maintain only one source per skill (see §5).
2. **Ships** a canonical set of v1 skills (see §7) covering a
   project's doc lifecycle: `doc-audit`, `spec-writer`,
   `decision-record-writer`, `handbook-writer`, `drift-detector`,
   plus `test-plan-writer`.
3. **Ships no agent persona.** The harness provides no role, no
   phase and no workflow: the team writes how it works in
   `docs/workflow/` and the agents read it. The only rule the harness
   imposes is doc-first, stated in the umbrella `AGENTS.md`. All
   skills and commands are dropped into the target directory for the
   engines the operator names (see §7, §8).
6. **Enforces its rules via linters**. Every check that can be
   mechanized (file presence, frontmatter schema, tech keywords
   in `spec/`, cross-links, freshness of the generated files) is
   shipped as an **exit-code linter** run in CI
   (`npx -y @vaubaan/harness lint`), in the project's git pre-commit
   hook and on demand, so that a harnessed project *cannot* merge a PR
   that creates mechanically detectable drift (see §10.2). No engine
   hook is installed. The `doc-audit` skill additionally covers the
   non-mechanizable semantic judgment.
4. **Maintains the doc**. The harness's implicit promise
   is: every harnessed project keeps its `docs/spec/`,
   `docs/decisions/`, `docs/handbook/` consistent and complete — it is
   `doc-audit` that checks it, and `spec-writer` /
   `decision-record-writer` / `handbook-writer` that feed it.
5. **Stays lightweight on the project repo side**. The generated files
   and the manifest are committed so that a clone has the whole
   context without the harness installed, but there is no logic to
   maintain: the harness version is the `@vaubaan/harness` version tag
   used at init. A project "is harnessed" because `vaubaan harness
   init` was run in its directory — no particular runtime needed.

### 1.1 Explicitly out of scope

- **No committed project manifest.** No `harness.yaml`,
  `.harness.json`, or equivalent. The project repo does not know which
  harness version it carries; that is carried by the version tag
  used at init.
- **No committed override.** The `.harness-overrides/` mechanism is
  *gitignored* by design (see §11). A harness fork for a
  project = forking the `@vaubaan/harness` package, not customizing in
  the repo.
- **No runtime daemon.** The harness is dropped configuration;
  nothing runs in the background. Skills execute in the
  coding engine's process (claude-code, codex-cli, opencode),
  not in a dedicated harness process.
- **No telemetry.** The harness phones home about nothing. The CLI only
  performs local file writes.
- **No cross-project sharing.** No "skills shared across
  several projects of the same org" — all skills come from the
  `@vaubaan/harness` package. If a project has a custom skill, it forks
  the package (or proposes it upstream).
- **No hot-reload during an execution.** Once `init` has run,
  the dropped files are frozen. To pick up an update:
  re-run `init` or `update` (idempotent; never overwrites a file
  the harness does not own).
- **No skill generation by the agent.** A skill is written
  deliberately by a human (or with an agent's help in
  brainstorm mode), then committed to `@vaubaan/harness`. No
  auto-creation.

## 2. Domain

### 2.1 Hierarchy

```
@vaubaan/harness (npm package, source of truth)
   │
   ├── skills/<id>.skill.md         # skill pivot format (see §5)
   ├── commands/<id>.cmd.md         # command pivot format (see §6)
   └── templates/                   # spec / decision / handbook / tests skeletons
   │
   │ rendered via
   ▼
CLI `vaubaan harness init <target-dir> --engines=<list>`
   │
   ▼
<target-dir>/
   ├── AGENTS.md                       # umbrella: working rule + project map + checks + doc-skills
   ├── .<engine>/skills/<id>/SKILL.md
   ├── .<engine>/commands/<id>.md
   └── .harness-overrides/             # (if present in the target directory, gitignored)
```

### 2.2 Definitions

| Entity            | Short definition                                                                                                                               |
|-------------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| **Harness**       | The `@vaubaan/harness` package + the `vaubaan harness *` CLI. No daemon.                                                                         |
| **Harness**       | The set of files dropped into the target directory: AGENTS.md + skills + commands rendered per-engine.                                         |
| **Engine**        | Target coding agent. v1: `claude-code`, `codex-cli`, `opencode`. Each has its native layout.                                                   |
| **Skill format**  | `*.skill.md`: Markdown + YAML frontmatter describing a skill (id, engines, tools, body prompt). Single source rendered per-engine. See §5.      |
| **Command format**| `*.cmd.md`: slash-command (trigger, args, invoked skill). See §6.                                                                                |
| **Renderer**      | Per-engine module that transforms `*.skill.md` / `*.cmd.md` into the target engine's native layout. See §4.                                      |
| **Doc**           | Umbrella = spec + decisions + handbook. Persists under `docs/` in the project repo.                                                              |
| **Override**      | File under `<target-dir>/.harness-overrides/` that overrides a skill / command for this project. Gitignored.                                   |
| **Skill manifest**| YAML frontmatter of a `*.skill.md` declaring `id`, `engines`, `tools`, `tags`. Source of authority for per-engine rendering.                     |

### 2.3 States (statelessness)

The harness **has no persistent runtime service**. Its rendering is
functional; the install and update operations keep the artifacts'
provenance and the necessary backups locally.
The content operations remain:

- **render(harness, engine, overrides) → files**: pure function,
  no side-effect. **Always** emits all agents, skills and
  commands; no per-kind filtering. Used by the `init` CLI.
- **audit(repo) → report**: `doc-audit` skill, executed by the agent
  within its invocation.
- **scaffold(repo, type) → files**: `spec-writer` /
  `decision-record-writer` / `handbook-writer` skills, executed by the agent.

Given identical inputs, rendering produces the same contents. Applying
these contents also takes into account the existing installation and
file ownership (update contract §13.1).

## 3. Filesystem layout

### 3.1 In the `@vaubaan/harness` package

```
node_modules/@vaubaan/harness/
├── package.json                      # version, peerDeps, exports
├── src/
│   ├── render.ts                     # pure render function
│   ├── renderers/
│   │   ├── claude-code.ts
│   │   ├── codex-cli.ts
│   │   └── opencode.ts
│   └── parser/
│       ├── skill.ts                  # parse *.skill.md frontmatter + body
│       └── cmd.ts                    # same for *.cmd.md
├── linters/                          # mechanical CI gates (see §10.2)
│   ├── readme-presence.ts
│   ├── readme-sections.ts
│   ├── doc-layout.ts
│   ├── cardinal-files.ts
│   ├── decision-schema.ts
│   ├── adr-no-tracks.ts
│   ├── frontmatter-tracks.ts
│   ├── tracks-drift.ts
│   ├── spec-tech-agnostic.ts
│   ├── cross-links.ts
│   ├── orphan-decisions.ts
│   ├── gitignore-harness.ts
│   ├── quality-schema.ts
│   └── generated-fresh.ts
├── skills/                           # doc-skills (cross-cutting)
│   ├── doc-audit.skill.md
│   ├── spec-writer.skill.md
│   ├── decision-record-writer.skill.md
│   ├── handbook-writer.skill.md
│   ├── test-plan-writer.skill.md
│   ├── workflow-writer.skill.md
│   ├── readme-writer.skill.md
│   └── drift-detector.skill.md
├── commands/
│   ├── doc-audit.cmd.md
│   ├── spec.cmd.md
│   ├── decision.cmd.md
│   ├── handbook.cmd.md
│   ├── test-plan.cmd.md
│   ├── workflow.cmd.md
│   ├── readme.cmd.md
│   └── drift.cmd.md
└── templates/
    ├── spec.md.tmpl
    ├── decision.md.tmpl
    ├── handbook.md.tmpl
    ├── integration-tests.md.tmpl
    ├── e2e-tests.md.tmpl
    ├── coding-workflow.md.tmpl
    ├── code-quality.md.tmpl
    └── readme.md.tmpl
```

### 3.2 In the target directory (after `vaubaan harness init`)

```
<target-dir>/
├── AGENTS.md                         # umbrella: working rule, project map, checks,
│                                    # listing of the available doc-skills/commands
├── CLAUDE.md                         # imports `@AGENTS.md` (claude-code only)
├── .harness-manifest.json            # what the harness wrote, with fingerprints
├── .claude/                          # if engine=claude-code
│   ├── skills/
│   │   └── <id>/SKILL.md
│   └── commands/
│       └── <id>.md
├── .agents/skills/<id>/SKILL.md      # if engine=codex-cli (also read by opencode)
├── .opencode/                        # if engine=opencode
│   ├── commands/
│   └── skills/                       # only if no other engine exposes the skills
└── .harness-overrides/               # optional, gitignored (see §11)
    ├── skills/
    └── commands/
```

The harness writes nothing under `.codex/` any more: Codex reads its
skills from `.agents/skills/` and has no command files. It writes no
engine settings file (`.claude/settings.json`, `.codex/hooks.json`),
no plugin and no MCP configuration: those are the project's.

### 3.3 In the project repo (what persists vs gitignored)

```
project/
├── README.md                         # ← COMMITTED (README pillar, root)
├── docs/                             # ← COMMITTED (5 underlying pillars)
│   ├── spec/
│   ├── decisions/
│   ├── handbook/
│   ├── tests/
│   └── workflow/
├── AGENTS.md, CLAUDE.md, .<engine>/  # ← COMMITTED (generated by `init`)
├── .harness-manifest.json            # ← COMMITTED (what was generated)
├── .gitignore                        # contains .harness-overrides/ and .vaubaan/
├── .harness-overrides/               # ← GITIGNORED (see §11)
├── .vaubaan/                         # ← GITIGNORED (skill reports)
└── (all the rest of the project code)
```

The files dropped by `init` are **committed**, like any generated code:
a clone has the whole context without the harness installed, and a
contributor without the tool still gets `AGENTS.md`. Two linters keep
this honest. `lint:gitignore-harness` requires `.harness-overrides/`
and `.vaubaan/` to be ignored and refuses a `.gitignore` entry for a
generated path. `lint:generated-fresh` renders the harness with the
engines recorded in the manifest and fails when a committed generated
file differs from the render, is missing, or is no longer rendered:
the fix is always to edit the source (`docs/` or the overrides), run
`update`, and commit. Decision:
[generated-files-committed](../decisions/generated-files-committed.md).

## 4. Multi-engine composition

### 4.1 Pivot format

One `*.skill.md` (or `*.cmd.md`) source → 3 renderers → 3 native
layouts. The source lives in `@vaubaan/harness/skills/` (resp.
`commands/`). The renderer is purely functional: no network I/O,
no persistent state.

```
                     ┌─── claude-code renderer ───► <target-dir>/.claude/skills/<id>/SKILL.md
                     │
*.skill.md ─► parser ──┼─── codex-cli renderer  ────► <target-dir>/.agents/skills/<id>/SKILL.md
                     │
                     └─── opencode renderer   ────► <target-dir>/.opencode/skills/<id>/SKILL.md
```

### 4.2 Capabilities matrix

Not all skills render identically on the 3 engines —
some support features that others lack. The matrix is
documented in `@vaubaan/harness/src/renderers/capabilities.ts`:

| Feature                        | claude-code | codex-cli | opencode |
|--------------------------------|:-----------:|:---------:|:--------:|
| Slash command                  |     ✅      |    ✅     |    ✅    |
| Skill auto-loaded via frontmatter |  ✅      |    ✅     |    ✅    |
| Multi-step workflow (subagent) |     ✅      |    ⚠️*    |    ✅    |
| Inline code execution          |     ✅      |    ✅     |    ✅    |

\* = supported with a degradation documented in the rendered skill (the
renderer emits a warning in the rendered skill's frontmatter).

If a source skill declares a `requires` that an engine does not
support, the renderer **skips** that skill for that engine and logs a
warning in `audit.log` (see §9). No fatal error.

### 4.3 Native engine layouts (reference)

| Engine        | Skill path                          | Command path                 | Frontmatter |
|---------------|-------------------------------------|------------------------------|-------------|
| claude-code   | `.claude/skills/<id>/SKILL.md`      | `.claude/commands/<id>.md`   | YAML        |
| codex-cli     | `.agents/skills/<id>/SKILL.md`      | — (custom prompts deprecated) | YAML        |
| opencode      | `.opencode/skills/<id>/SKILL.md`    | `.opencode/commands/<id>.md` | YAML        |

These paths are the ones each engine's documentation declares it
reads, verified on 2026-09-20 (see ADR
[_engine-native-layouts-1-0_](../decisions/engine-native-layouts-1-0.md)).
OpenCode also reads `.claude/skills/` and `.agents/skills/`: when
another rendered engine already exposes a skill, the `.opencode/skills/`
copy is omitted to avoid duplicates.

## 5. `*.skill.md` format

```markdown
---
id: doc-audit
description: |
  Audits the completeness of the doc (spec + decisions + handbook)
  of the current project. Reports gaps: features without a spec,
  implicit decisions not turned into ADRs, handbooks outdated vs code.
engines: [claude-code, codex-cli, opencode]  # rendered on these engines (omit = all)
requires:                              # required engine capabilities
  - multi-step
tags: [audit, doc]                     # for the UI picker
---

# Doc Audit

You are invoked to audit the completeness of a Vaubaan
project's doc. The doc lives under `docs/` + `README.md` at the root and has 6 pillars:

- `docs/spec/`     — theoretical vision (what we want)
- `docs/decisions/` — ADRs (what we settled)
- `docs/handbook/`   — implementation docs (how it actually works)

## Criteria per pillar

### Spec
- Each major subsystem (1 folder under `packages/` or top-level route)
  has at least one spec file.
- ...

### Decisions
- ...

### Handbook
- ...

## Procedure

1. ...
2. ...

## Expected output

Markdown:

```
# Doc Audit Report — <project> @ <commit>

## Spec
- ✅ covered: ...
- ⚠️ gaps: ...

## Decisions
...

## Handbook
...

## Recommendations
...
```
```

**Writing rules**:

- Strict frontmatter (Zod schema in `@vaubaan/harness/src/parser/skill-schema.ts`).
- Body = free-form Markdown, the content of the system prompt rendered to the agent.
- No conditional logic in the body (no Jinja / Handlebars
  templating) — it is a prompt, not a template. Per-engine
  variation is handled via the frontmatter (`engines:`, `requires:`).

## 6. `*.cmd.md` format

```markdown
---
id: doc-audit
trigger: /doc-audit                    # slash in the agent
invokes_skill: doc-audit               # skill to activate
args:
  - name: scope
    type: enum
    values: [spec, decisions, handbook, all]
    default: all
description: Audits the project's doc completeness (scope of your choice).
---

# /doc-audit

When the human or the agent invokes `/doc-audit [scope]`, load the
`doc-audit` skill with the scope passed as argument.
```

Commands are **thin**: they are just a `slash → skill +
args` binding. All the logic lives in the skill (`*.skill.md`).

## 7. Skills shipped

One category: **doc-skills**, cross-cutting, all dropped into the
target directory. The harness ships no agent persona and no
code-quality audit: roles, phases and code judgment belong to the
project (see
[no-personas-no-code-judgment](../decisions/no-personas-no-code-judgment.md)).

### 7.1 Doc-skills

| ID                          | Role                                                                                                                 |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------|
| `doc-audit`                 | Audits the completeness of the doc (see §10).                                                                  |
| `spec-writer`               | Human-guided, progressive wizard to write / update a `docs/spec/<name>.md` file, section by section.                 |
| `decision-record-writer`    | Wizard to write an ADR under `docs/decisions/<slug>.md` (no numbering — see §9.1). Detects implicit decisions in the current diff.  |
| `handbook-writer`           | Documents the actual implementation under `docs/handbook/<name>.md`. Reads the code, proposes, the human validates.     |
| `test-plan-writer`          | Updates `docs/tests/integration-tests.md` and/or `docs/tests/e2e-tests.md`. Detects unlisted scenarios from the existing test code. |
| `workflow-writer`           | Updates `docs/workflow/coding-workflow.md`. Reads the repo's CI/CD config, the package manifest scripts and the branch/PR config, proposes the required sections (CI / env / PR / branches / release) and the optional ones (languages). |
| `readme-writer`             | Maintains `README.md` at the root. Syncs the links to the other pillars; makes sure pitch + quick start stay up to date vs the code. |
| `drift-detector`            | Detects code ↔ doc divergences.                                                                                      |

All skills are `.skill.md` files. Their evolution is versioned
by the package version tag. **All are dropped into the target
directory**: only the `engines:` and `requires:` constraints (see
§4.2) filter a skill out of a given engine render. A skill says *how*
to write or check a pillar, never *when*: the when is the team's
workflow.

## 8. Composition: umbrella + skills + commands

`vaubaan harness init <target-dir> --engines=<list>` performs a
monolithic multi-engine drop:

- **The engine list is mandatory** (`--engines=claude-code`, or several
  comma-separated). Nothing is rendered for a tool the project does not
  use; `update` keeps the engines recorded in the manifest. Decision:
  [engine-choice-mandatory](../decisions/engine-choice-mandatory.md).
- **Rendered content**: everything lives directly under the engine's
  native folders (`.claude/`, `.agents/`, `.opencode/`). No indirection.
- **Umbrella `AGENTS.md`** at the root, engine-neutral, in four
  sections: the project map (where each pillar lives, including the
  optional ones when present), the doc-first rule, the checks (run
  `lint` before committing, never edit a generated file by hand) and
  a single compact list of the doc-skills with their slash-command
  when one exists. The engines discover skills natively.
- **`CLAUDE.md`** at the root **if** claude-code is included, reduced to the `@AGENTS.md` import: the umbrella is actually loaded on all versions and all providers of Claude Code.

**Actual rendering in the target directory**:

```
<target-dir>/AGENTS.md                          = umbrella: project map + doc-first + checks
                                                  + "Doc-skills" section: one line per dropped doc-skill
<target-dir>/.<engine>/skills/<id>/SKILL.md     = render(<id>.skill.md, engine)
                                                  for each doc-skill in the catalog
<target-dir>/.<engine>/commands/<id>.md         = render(<id>.cmd.md, engine)
                                                  for each command in the catalog
```

## 9. Doc pillars — persistent contract

### 9.1 Layout

```
project/
├── README.md                         # README pillar (root, outside docs/)
└── docs/
    ├── spec/
    │   ├── README.md                 # spec index
    │   ├── <subsystem>.md            # 1 file per major subsystem
    │   └── ...
    ├── decisions/
    │   ├── README.md                 # ADR index
    │   ├── <slug>.md                 # no numbering (see §9.1.1)
    │   └── ...
    ├── handbook/
    │   ├── README.md                 # handbook index
    │   ├── <slug>.md                 # no numbering (see §9.1.1)
    │   └── ...
    ├── tests/
    │   ├── README.md                 # test plan index
    │   ├── integration-tests.md      # integration test plan (required)
    │   └── e2e-tests.md              # E2E test plan (required)
    ├── workflow/
    │   ├── README.md                 # workflow index
    │   └── coding-workflow.md        # required in v1: CI + env + PR + branches
    ├── skills/                       # OPTIONAL (see §9.1.2)
    │   └── <id>.skill.md             # the project's domain skills
    └── quality/                      # OPTIONAL (see §9.1.2)
        └── code-quality.md           # required: the project's quality rules
```

**Notes**:
- The `README` pillar lives at the root (universal convention of
  package registries), not under `docs/`. It is the only pillar
  outside `docs/`.
- The `tests/` pillar is *intentionally constrained* to two required
  files in v1 (`integration-tests.md`, `e2e-tests.md`). Unit
  tests live next to the code and speak for themselves — we do not
  document them separately.
- The `workflow/` pillar contains only one required file in v1
  (`coding-workflow.md`). Possible future extensions
  (`release-workflow.md`, `incident-workflow.md`, …) — OQ §16.2.

### 9.1.1 No numbering for `decisions/` and `handbook/`

Files under `docs/decisions/` and `docs/handbook/` are named
`<slug>.md` (kebab-case) — **without a numeric prefix** like `0001-...` or
`01-...`. Deliberately:

- **No implicit precedence logic.** An ADR supersedes another
  only if it says so explicitly (`superseded_by: <slug>` field
  in frontmatter, or header metadata). The file order
  carries nothing. Same for the handbook: each entry is independent,
  not a chapter in a sequence.
- **Evolution without renaming.** Adding, archiving, refactoring doc
  content without renumbering or breaking existing links.
- **The slug is the durable identity** — it survives moves and
  stays searchable. The harness tools (`decision-record-writer`,
  `handbook-writer`) always generate slugs, never numbers.

### 9.1.2 Optional pillars

Two pillars are added to the six mandatory ones. Their absence is
never an error; their presence commits to a form contract.

- **`skills/`** — domain skills versioned with the project, rendered
  alongside the shipped skills. See ADR
  [project-skills-seventh-pillar](../decisions/project-skills-seventh-pillar.md).
- **`quality/`** — the code quality rules *specific to the project*.
  A single required file, `code-quality.md`. See ADR
  [quality-optional-pillar](../decisions/quality-optional-pillar.md).

**Contract of the `quality/` pillar.** The file is *normative*: it states
what the project requires, not what the code does today. It
has three required sections:

1. **Mechanical checks** — the project's automated tools
   (formatting, static analysis, typing), their configuration
   file and what each covers. The configuration remains the
   source of truth: this section *points* to it, it does not
   copy any rule.
2. **Project rules** — the judgment rules that no tool
   checks: naming, decomposition, chosen patterns, thresholds.
3. **Accepted deviations** — the generic rules the project chooses
   not to follow, each with its reason.

**Boundaries with the other pillars** (anti-drift, see §9.3):

- The *why* of a structural choice remains an ADR; `code-quality.md`
  states the rule and points to the ADR.
- The description of the actual implementation remains in the handbook.
- Generic quality principles are not restated; the file lists only
  what is specific to the project.
- CI commands remain in `coding-workflow.md`.

**Effect on the agents.** When the file exists, `AGENTS.md` lists it
in the project map and every agent reads it before writing or
auditing code. The harness ships no code audit skill: a project that
wants one keeps it in `docs/skills/`, where it reads this file first.

The file declares no `tracks:`: like an ADR, it sets a
norm and does not follow the state of the code.

### 9.2 Templates (shipped by the harness)

`@vaubaan/harness/templates/{readme,spec,decision,handbook,integration-tests,e2e-tests,coding-workflow,code-quality}.md.tmpl`.
The wizards (`readme-writer`, `spec-writer`, `decision-record-writer`,
`handbook-writer`, `test-plan-writer`, `workflow-writer`) instantiate these
templates. Minimal format:

- **README.md**: 1-line pitch + What is this (1 §) + Quick start
  (install + run) + Links (docs/spec, docs/handbook, docs/workflow,
  …) + License / Contributing.
- **spec.md**: Status + Vocabulary + Vision + Out of scope + Domain
  + ... (see this harness spec — it is the canonical template).
- **decision.md**: Context + Decision + Consequences + Rejected
  alternatives + Date + Author.
- **handbook.md**: Overview + How it works (cross-link to the
  code) + How to use it + How to debug.
- **integration-tests.md**: Scope (what is tested in integration
  vs unit vs e2e) + Test stack + List of covered scenarios +
  Known gaps.
- **e2e-tests.md**: Scope (golden paths vs edge cases) + Stack
  (Playwright/etc.) + Fixture conventions (e2e org, naming) +
  Sweeper / cleanup + List of covered scenarios.
- **coding-workflow.md**: CI pipeline (what triggers what, typical
  duration, required jobs) + Env variants (prod / staging / preview /
  local) + PR process or direct-push (depending on the project) + Branch model
  (trunk-based, gitflow, etc.) + Commit / merge conventions +
  **Release** (who triggers it, how we tag, rollback,
  freeze windows).
- **code-quality.md** (optional pillar): Mechanical checks +
  Project rules + Accepted deviations. No dedicated wizard in v1: the
  file is edited by hand from the template.

### 9.3 Completeness criteria (audited by `doc-audit`)

- **README presence**: `README.md` at the root **must** exist and
  contain at least the template sections (pitch + quick start +
  links). Gap → ❌.
- **README links**: the README must explicitly link to
  `docs/spec/`, `docs/handbook/`, `docs/workflow/coding-workflow.md`
  (linking the other pillars is optional). Otherwise → ⚠️.
- **Spec coverage**: every major subsystem has a spec. A
  subsystem is defined as "a package under `packages/`" or "a
  top-level route of an app" (configurable via
  `.harness-overrides/doc-audit.config.yaml` if needed).
- **Explicit decisions**: `doc-audit` parses recent commits and
  flags commits whose message contains decision hints
  ("decided to", "switched from X to Y", "removed X because") without
  a matching ADR.
- **Handbook freshness**: each handbook declares in frontmatter a
  list of code files it depends on (`tracks: [...]`).
  `doc-audit` compares the mtime / commit-time of the handbook vs its
  tracked files. Drift beyond a threshold (configurable, default N
  commits) → warning.
- **Tests presence**: the two required files
  (`integration-tests.md`, `e2e-tests.md`) **must** exist. Gap
  → ❌.
- **Tests coverage cross-check**: each spec must be mentioned
  by at least one scenario in `integration-tests.md` *or*
  `e2e-tests.md` (explicit cross-link via `[[spec-name]]` or scenario
  ID). Otherwise → ⚠️ "spec without a test plan".
- **Tests freshness**: same `tracks: [...]` criteria as handbook —
  an outdated test plan that refers to code that has disappeared = ❌.
- **Workflow presence**: `docs/workflow/coding-workflow.md` **must**
  exist and cover the 5 core topics (CI, env variants, PR
  process, branches, release). Gap → ❌.
- **Workflow freshness**: `coding-workflow.md` typically `tracks:`
  the project's CI/CD config files and package manifest.
  Drift vs tracked files → ⚠️.
- **Quality (optional pillar)**: if `docs/quality/` exists,
  `code-quality.md` **must** exist with its three required
  sections (see §9.1.2). Gap → ❌. Directory absent → nothing to
  report. Content that copies an ADR, a handbook, a tool's
  configuration or generic principles → ⚠️ (pillar boundary).
- **Cross-link consistency**: a spec file must have at least one
  decision or one handbook *or* a mention in tests (otherwise orphan).
  A decision must have at least one linked spec or handbook. Etc.
- **Pillar boundaries — anti-drift between pillars.** The
  spec / handbook / decisions separation is subtle: it is *the* critical point
  where the doc drifts if it is not audited. Heuristics (mix of regex +
  LLM judgment by the agent executing the skill):
  - **spec/** must stay *tech-agnostic*: flag mentions of
    concrete libraries/frameworks/runtimes, code file
    paths, or code blocks → suggest a move to `handbook/` or
    turning it into an ADR. The effective blocklist is defined in the
    source code of the `spec-tech-agnostic` linter.
  - **handbook/** must describe the real technical *how*: flag
    files that mention no code file and no
    technology → suggest a move to `spec/`.
  - **decisions/** must have 4 sections: Context + Decision +
    Consequences + Rejected alternatives. Flag ADRs that are
    limited to a decision summary with no context or alternatives
    (= not really a decision, it is documentation).
  - Reverse case: any commit that mentions a lib or an
    architectural choice without a matching ADR is already flagged by
    "Explicit decisions" (see above).

## 10. Doc audit: skill + linters

The §9.3 criteria are checked on **two complementary levels**,
shipped by the harness and injected into the project at the same time:

- **§10.1 `doc-audit` skill** — the *intelligent* audit, executed by
  an agent (LLM judgment needed for subtle cases: pillar
  boundaries, semantic freshness, implicit decisions). Output =
  Markdown report.
- **§10.2 Mechanical linters** — the *exit-code* version of the checks
  that can be mechanized (file presence, frontmatter schema,
  tech keyword regex blocklist, cross-links). Run in CI,
  they **block the merge** if red.
- **§10.3 Division of labor** between the two.

### 10.1 `doc-audit` skill

Typically run before a review or a plan. Reads `docs/`,
parses each file's frontmatter, runs the §9.3 checks.

Output: a Markdown report under `.vaubaan/reports/doc-audit.md`
(creates the folder if absent) in the target directory, or at a path
passed as argument. Format:

```markdown
# Doc Audit Report — <project> @ <commit>

## Spec coverage (3/5 covered)

- ✅ coding-agent-harness.md
- ✅ renderer-pipeline.md
- ⚠️ overrides.md (NEW — verify completeness)
- ❌ web-ui (missing)
- ❌ legacy-migration (missing)

## Explicit decisions (12 ADRs, 3 implicit detected)

- ADRs OK: all `docs/decisions/*.md` files have the 4 required
  sections.
- Implicit suspects (no ADR found):
  - commit abc123 "switched from gray-matter to a custom YAML reader"
  - commit def456 "removed plugin-host system"
  - commit ghi789 "RendererTable → RendererRegistry rename"

## Handbook freshness (2/5 fresh, 3 stale)

- ✅ docs/handbook/renderer-pipeline.md (1 commit since last edit)
- ⚠️ docs/handbook/overrides-loading.md (12 commits drift — review)
- ❌ docs/handbook/legacy-services.md (refers to deleted code)
- ...

## Tests coverage (1/2 cardinal files present)

- ✅ docs/tests/integration-tests.md
- ❌ docs/tests/e2e-tests.md (MISSING — required)
- Specs without a test plan:
  - ⚠️ coding-agent-harness.md (no scenario references it)
  - ⚠️ web-ui.md §6.7 component-registry (export not covered)

## README (root)

- ✅ README.md present
- ⚠️ "Quick start" section missing
- ⚠️ no link to docs/workflow/coding-workflow.md

## Workflow

- ✅ docs/workflow/coding-workflow.md present
- ⚠️ "Release" section missing
- ⚠️ tracks: [.github/workflows/ci.yml] but the file has diverged by 18 commits since last edit

## Cross-link consistency

- Orphan spec: docs/spec/coding-agent-harness.md (no decision/handbook yet — expected for new spec)
- Orphan decision: docs/decisions/legacy-store.md (no longer referenced anywhere — candidate for archival)

## Pillar boundaries (anti-drift)

- ⚠️ docs/spec/web-ui.md mentions "React + Tailwind" — tech stack,
  should be an ADR (`stack-frontend.md`).
- ⚠️ docs/decisions/renderer-tables.md has no
  "Rejected alternatives" section — it is a decision note, not an ADR.
- ✅ No user-facing content detected in handbook/.

## Recommendations

1. Write docs/handbook/legacy-services.md or archive the file.
2. Turn the 3 detected implicit decisions into ADRs (see /decision).
3. Refresh docs/handbook/overrides-loading.md vs the current code.
```

Global verdict: `done` if zero `❌`, otherwise `needs-human`. The report
serves as the verdict's justification for the orchestrating tool or
the human consuming the output.

### 10.2 Mechanical linters (CI gates)

Shipped in `@vaubaan/harness/linters/` (accessible via the CLI). Each linter is a pure function `(repoRoot) → LintIssue[]`
with an aggregated exit code: `0` if zero issues of severity ≥ `error`,
`1` otherwise.

```bash
vaubaan harness lint                       # all linters, aggregated exit code
vaubaan harness lint --pillar=spec         # a single pillar
vaubaan harness lint --format=json         # JSON output for CI parsing
vaubaan harness lint --fix                 # auto-fix when possible (rare)
```

**Linters shipped in v1**:

| Linter ID                       | Targeted pillar(s)       | Check                                                                                                                                                     | Severity      |
|---------------------------------|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| `lint:readme-presence`          | README                   | `README.md` exists at the root.                                                                                                                          | error         |
| `lint:readme-sections`          | README                   | `README.md` contains the template sections (regex on headers).                                                                                           | error         |
| `lint:doc-layout`               | all                      | `docs/{spec,decisions,handbook,tests,workflow}/` exist.                                                                                                  | error         |
| `lint:cardinal-files`           | tests, workflow          | `tests/integration-tests.md`, `tests/e2e-tests.md`, `workflow/coding-workflow.md` exist.                                                                  | error         |
| `lint:decision-schema`          | decisions                | Each ADR has the 4 sections Context + Decision + Consequences + Rejected alternatives (regex headers).                                                     | error         |
| `lint:adr-no-tracks`            | decisions                | No ADR declares a non-empty `tracks:` (ADRs document a frozen decision, not the current state of the code).                                              | error         |
| `lint:frontmatter-tracks`       | handbook, tests, workflow | Each file declares `tracks: [...]` in frontmatter and all tracked paths exist in the repo.                                                               | error         |
| `lint:tracks-drift`             | handbook, tests, workflow | The doc file is older than its tracked files by more than N commits (configurable).                                                                      | warning       |
| `lint:spec-tech-agnostic`       | spec                     | Blocklist of tech keywords (frameworks, runtimes, infra providers — effective list in the source code) **forbidden** in `spec/` files.                   | error         |
| `lint:spec-has-content`         | spec                     | `docs/spec/` contains at least one `.md` file (warns if the directory exists but is empty).                                                              | warning       |
| `lint:cross-links`              | all                      | All Markdown links `[...](docs/...)` resolve to an existing file.                                                                                        | error         |
| `lint:orphan-decisions`         | decisions                | Each ADR is referenced by at least one other doc file.                                                                                                   | warning       |
| `lint:gitignore-harness`        | repo root                | `.gitignore` excludes `.harness-overrides/` and `.vaubaan/`, and ignores none of the generated paths (`AGENTS.md`, `CLAUDE.md`, engine folders, manifest). | error         |
| `lint:quality-schema`           | quality (optional)       | If `docs/quality/` exists: `code-quality.md` exists and contains the 3 required sections (regex headers). No effect if the directory is absent.           | error         |
| `lint:generated-fresh`          | repo root                | When a manifest exists: every generated file equals the current render for the recorded engines and overrides; none is missing or stale.                 | error         |

**Text output** (human, default):

```
docs/spec/web-ui.md:34: error[lint:spec-tech-agnostic]
  forbidden tech keyword "Next.js" — should be in handbook/ or decisions/

docs/decisions/renderer-tables.md: error[lint:decision-schema]
  missing required section "Rejected alternatives"

docs/handbook/overrides-loading.md:1: error[lint:frontmatter-tracks]
  missing frontmatter `tracks:` field

3 errors, 1 warning. ✘ CI fails.
```

**JSON output** (CI parsing):

```json
{
  "version": 1,
  "summary": { "errors": 3, "warnings": 1, "pass": false },
  "issues": [
    {
      "linter": "lint:spec-tech-agnostic",
      "severity": "error",
      "file": "docs/spec/web-ui.md",
      "line": 34,
      "message": "forbidden tech keyword \"Next.js\""
    }
  ]
}
```

**CI integration**:

```yaml
# .github/workflows/doc.yml
name: doc
on: [pull_request]
jobs:
  doc-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npx -y @vaubaan/harness lint
      # exit code != 0 → PR blocked
```

**Pre-commit integration**: the same command in the project's git
pre-commit hook, so the agent sees the report as a failed command in
its own flow, at zero token cost, before anything leaves its machine:

```bash
# pre-commit hook
npx @vaubaan/harness lint
```

This is how the harness rules become *enforced* rather than
merely recommended: a harnessed project cannot merge a PR
that creates mechanically detectable drift. No engine hook is
installed; the decision is
[lint-in-ci-and-pre-commit](../decisions/lint-in-ci-and-pre-commit.md).

### 10.3 Division of labor: skill vs linters

| Check                                                       | Mechanical linter | `doc-audit` skill |
|-------------------------------------------------------------|:-----------------:|:-----------------:|
| Presence of pillars + required files                        |        ✅         |        ✅         |
| Frontmatter schema (`tracks:`, ADR sections)                |        ✅         |        ✅         |
| Markdown cross-links                                        |        ✅         |        ✅         |
| Tech keywords in `spec/` (regex blocklist)                  |        ✅         |        ✅         |
| `tracks:` points to existing files                          |        ✅         |        ✅         |
| Implicit decisions detected in `git log`                    |        ❌         |        ✅         |
| Subsystem spec coverage (semantic judgment)                 |        ❌         |        ✅         |
| Subtle boundary drift (ambiguous spec/handbook content)     |        ❌         |        ✅         |
| Semantic manual freshness (did the code really change?)     | partial (count)   |        ✅         |
| Doc move / refactor suggestions                             |        ❌         |        ✅         |

**Golden rule**: every check that can be written as a regex / AST parser
*must* become a linter (and therefore a CI gate); the skill keeps the
checks that require judgment.

## 11. Gitignored overrides

A project can locally override the harness via the
`.harness-overrides/` folder in its worktree. **Gitignored by design
— never committed.** Typical use cases:

- A dev iterating on a new skill, before pushing it
  upstream into `@vaubaan/harness`.
- Temporary tinkering for debugging.
- Disabling a standard skill for a project where it is
  useless (rare).

Layout:

```
project/.harness-overrides/
├── skills/
│   └── my-custom-skill.skill.md        # addition; merged with the catalog
│   └── doc-audit.skill.md              # override; replaces the stock version
├── commands/
│   └── ...
└── disable.yaml                      # list of IDs to disable
    # disable:
    #   - drift-detector
```

The renderer applies the overrides after the stock catalog. Order:
`stock + overrides_add - overrides_disable`, and on collision the override
wins.

**Why gitignored?** To preserve the promise "every harnessed
project behaves identically". If committed overrides were allowed,
each project would diverge and the "Vaubaan harness" invariant would
dissolve. To propagate an improvement: upstream PR on
`@vaubaan/harness`, period.

## 12. Security

The harness carries no security model of its own — it is merely a
dropper of text files. Execution security is carried by
**whoever invokes the harness and launches the engine** (CI runner,
agent orchestrator, human). The harness relies on that trust
boundary.

- **YOLO by design on the skills side.** No skill declares a
  tool allowlist. If the called engine runs in "ask
  permission for each tool" mode, it is up to the operator (human or
  orchestrator) to configure it; the shipped skills assume a
  bypass-permissions mode or equivalent. Adding a per-skill
  tool allowlist layer would be defense-in-depth that
  does not increase real security (the blast radius is defined by
  the isolation of the calling environment) and creates needless
  friction with the agent.
- **No arbitrary skill injection at render.** The `vaubaan harness
  init` CLI renders only what is embedded in the
  `@vaubaan/harness` package + any `.harness-overrides/`
  present in the target directory. No network loading, no
  dynamic fetch. A malicious override therefore already requires
  write access to the target directory — a trust level
  equivalent to being able to launch the engine itself.
- **No secret access by the harness.** The CLI only reads
  text files (`*.skill.md`, `*.cmd.md`) and writes
  text files. It does not touch secret environment
  variables, nor vaults; and the shipped skills
  never assume explicit handling of cleartext
  secrets.
- **Signed `*.skill.md` frontmatter?** Not in v1. The
  `@vaubaan/harness` package is delivered via the standard registry; its supply
  chain relies on that registry + the hash in the lock-file. OQ for v2
  (signing via cosign / sigstore).

## 13. UX

### 13.1 For the harnessed project

A project's operator runs `vaubaan-harness init` the first
time, then `update` for updates. It is the orchestrating tool
(human, script, CI, or third-party agent) that invokes the CLI — the harness
assumes nothing about that caller.

**First-install CLI**: `vaubaan-harness init`. Mechanical rendering.

```bash
vaubaan-harness init <target-dir> --engines=claude-code,codex-cli \
                                 [--overrides-dir=<target-dir>]
# --engines is mandatory. Effects:
#  - render AGENTS.md umbrella → <target-dir>/AGENTS.md
#  - render the doc-skills and the commands supported by each engine
#  - apply the overrides from the explicitly provided parent
#  - write .harness-manifest.json
# Output: exit 0, file count rendered, and the next step: commit the
# generated files. No network I/O.
```

Idempotent: re-running `init` refreshes the dropped files without
requiring cleanup, and keeps the choices recorded by previous runs
(preserved files, overrides folder).

`init` never overwrites or deletes a file it does not own. A generated
path already holding a file the harness did not write, or a generated
file edited since, stops the command before any write and is reported;
the operator moves the content or keeps the file with `--preserve`.
The harness never merges a file and writes no engine settings file:
`.claude/settings.json`, `.codex/hooks.json` and the MCP configurations
are the project's. Decisions:
[safe init](../decisions/safe-init.md),
[no MCP, no code merge](../decisions/no-mcp-no-code-merge.md).

**Preserving the project during an update or a removal:**

- Files that have become unnecessary are removed only when the
  harness's ownership of them is established. The full set of destinations is
  validated before any deletion; an unsafe external or indirect
  destination makes the operation fail with no partial deletion.
- A file the harness did not write, or that changed since it wrote
  it, is never replaced or removed. Without sufficient proof of
  ownership, preservation prevails. Files 1.x edited entry by entry
  (`.mcp.json`, `.codex/config.toml`, `.opencode/opencode.json`) are
  released to the project.

The technical decision and the compatibility of existing installations
are detailed in
[safe lifecycle of project artifacts](../decisions/safe-project-artifact-lifecycle.md).

#### Updating an existing installation

A dedicated operation updates a known installation to the harness
version chosen by the caller. It neither looks for nor downloads a
more recent version. It recognizes older installations and
keeps the engines, the hooks preference, the project skills and
the applicable overrides.

The update preserves the project's own configuration files and
hooks. It renews only the harness elements and migrates
locations that have become obsolete without overwriting a user
file. An unknown destination that already contains a file is treated
as a conflict. A manifest written by 1.x may still list engine
settings or MCP files; they leave the manifest with a warning and stay
in place.

The preview modifies no file. Before applying, the
destinations and conflicts are checked, then a private backup is
created. An application error triggers a rollback to the previous state
of the touched files; any restoration difficulty is reported and
the backup remains available. The provenance of generated files is
kept to detect local modifications on subsequent
updates. A managed file modified since the last generation and
different from the new rendering blocks the update before writing.
The caller can explicitly transfer a generated artifact to the
project's ownership and exclude it from future generations; this choice
is remembered. The manifest cannot be transferred by this option.
Older installations without this provenance produce a
warning before regenerating their files declared as managed.

This operation updates the project's artifacts, not the dependencies
or package versions declared by that project.

The compatibility and transaction details are decided in
[migration of existing installations](../decisions/project-update-migrations.md).

**Layout check CLI**: `vaubaan-harness check`.

```bash
vaubaan-harness check ./my-project
# → exit 0 if docs/ exists, .gitignore covers .harness-overrides/ and
#   .vaubaan/, and ignores none of the generated files
# → exit 1 + diagnostic otherwise
```

**Lint CLI (CI gate)**: `vaubaan-harness lint`. Runs all the
mechanical linters (§10.2) and exits `0` or `1`. To be wired into the CI
of the harnessed project to **block PRs** that create drift:

```bash
vaubaan-harness lint                       # all linters, aggregated
vaubaan-harness lint --pillar=spec         # targeted
vaubaan-harness lint --format=json         # CI parsing
```

**Bootstrapping the doc of an existing project**: *not a CLI*.
It is intelligence — the agent, following the doc-first rule of
`AGENTS.md` (*"understand the docs, fill the gaps, then code"*), finds
the gaps via `doc-audit`, then fills them by calling the writers
(`spec-writer`, `decision-record-writer`, `handbook-writer`,
`test-plan-writer`).

### 13.2 For skill developers (Vaubaan contributors)

Iteration workflow:

```bash
# 1. Clone @vaubaan/harness
gh repo clone vauban/harness
cd harness/

# 2. Edit a skill
$EDITOR skills/doc-audit.skill.md

# 3. Local render for preview
npx @vaubaan/harness render --engines=claude-code --out=/tmp/rendered
ls /tmp/rendered/

# 4. Test on a project via override
cp skills/doc-audit.skill.md /path/to/project/.harness-overrides/skills/
# re-run `vaubaan harness update <project>` → the modified skill is rendered

# 5. Upstream PR when satisfied
```

## 14. Tests

### 14.1 Unit (Vitest)

- `*.skill.md` / `*.cmd.md` parser: property tests on the Zod frontmatter.
- Renderers: per-engine snapshot tests (input = `.skill.md` fixture,
  output = expected native layout).
- Capabilities matrix: test that if `requires: multi-step` is declared
  and an engine does not support it, the renderer skips + emits a warning.

### 14.2 Integration

- `vaubaan harness init` on an empty target directory × engine →
  snapshot matrix of the rendered layout.
- `vaubaan harness check` on repos in various states (empty,
  missing `docs/`, missing correct `.gitignore`, complete, etc.) →
  matrix of return codes.
- `vaubaan harness lint` on a matrix of fixture repos (each
  linter has its "pass" fixture and its "fail" fixture) → checks that
  the return codes + the produced `LintIssue[]` are exact. One
  fixture per shipped linter (§10.2).
- `doc-audit` run on a fixture repo with known gaps → checks
  that the report surfaces exactly the expected gaps.
- `lint:generated-fresh` on a harnessed fixture: passes after `init`,
  fails after a generated file is edited by hand.

### 14.3 E2E

- `vaubaan harness init <tmp> --engines=claude-code` then check that
  `<tmp>/.claude/skills/doc-audit/SKILL.md` and `<tmp>/AGENTS.md` exist
  on disk, and that no `.claude/agents/` folder was written.
- `/doc-audit` invocation on the vaubaan repo itself → report
  generated, verdict produced.
- Modified `.harness-overrides/skills/doc-audit.skill.md` override →
  re-run `init` → rendered skill = the override version, not the
  stock one.

### 14.4 Self-application (dogfooding)

The `@vaubaan/harness` repo itself is harnessed. `doc-audit` run on
this repo legitimately reports (in v1):

- **Partial handbook** at the beginning (the `handbook/` pillar is built
  as the code is written).
- Specs OK for the harness (this spec).
- Decisions: to be fleshed out over the course of the cutover.

The `doc-audit` E2E on this repo itself is an integration test: it
must always pass (in the sense of "producing a report"), even if the
verdict is `needs-human` because of the known gaps.

## 15. Initial cutover plan (historical)

The initial launch was greenfield, with no migration or dual-write.
Now-existing installations follow the `update` contract of
§13.1. Historical sequence:

1. **Spec OK** (this document, validated).
2. **Branch `agent/coding-agent-harness-greenfield`** from `staging`.
3. **New package** `@vaubaan/harness` — sources §3.1 (tech stack: see ADR [typescript-node-stack](../decisions/typescript-node-stack.md)).
4. **Companion CLI** `vaubaan harness *` (bin `vaubaan-harness`,
   or integrated into the existing `vaubaan` binary if present).
5. **v1 content shipped** in `@vaubaan/harness/`:
   - **agents** (`agents/`): `coding`, `review`, `merge`, `planning`;
   - **doc-skills** (`skills/`): `doc-audit`, `spec-writer`,
     `decision-record-writer`, `handbook-writer`, `test-plan-writer`,
     `workflow-writer`, `readme-writer`, `drift-detector`;
   - **commands** (`commands/`) mirroring the exposed doc-skills;
   - **templates** (`templates/`) for the 7 required files;
   - **linters** (`linters/`): the 13 linters of §10.2.
6. **The `coding-agent-harness` repo itself (dogfooding)**: we apply
   the harness to ourselves. A `vaubaan harness init .
   --engine claude-code` run drops the umbrella AGENTS.md + the 4 subagents
   + skills + commands; the called agent (depending on the session) runs
   `doc-audit`, finds the gaps (handbook + tests missing), fills them
   via the writers — and only then tackles its task. `docs/spec/` and
   `docs/decisions/` already exist. A GitHub Actions workflow
   runs `vaubaan harness lint` on each PR (becomes blocking
   once the gaps are filled).
7. **E2E green** before merging into `staging`.

No feature flag. No coexistence period.

## 16. v1 decisions & open questions

### 16.1 v1 decisions

- **Name**: the harness, published as `@vaubaan/harness`.
- **Standalone.** The harness is a package + CLI, with no dependency
  on any particular orchestrator. It is the caller (human, CI,
  third-party script) that invokes the CLI.
- **Multi-engine in v1**: yes, the 3 engines (claude-code, codex-cli,
  opencode) are shipped. Pivot format `*.skill.md` / `*.cmd.md`.
- **Generated files committed.** `AGENTS.md`, `CLAUDE.md`, the engine
  folders and the manifest are committed; `lint:generated-fresh` keeps
  them equal to the current render. The project maintains nothing by
  hand outside `docs/`. See
  [generated-files-committed](../decisions/generated-files-committed.md).
- **Lint in CI and pre-commit, no engine hook.** See
  [lint-in-ci-and-pre-commit](../decisions/lint-in-ci-and-pre-commit.md).
- **No MCP configuration, no code-driven merge.** See
  [no-mcp-no-code-merge](../decisions/no-mcp-no-code-merge.md).
- **Gitignored project overrides.** No committed local fork; to
  amend the harness, upstream PR.
- **Language & runtime**: see ADR [typescript-node-stack](../decisions/typescript-node-stack.md).
- **No auto-generated skill.** A skill is written by a human and
  committed to the package.
- **Doc = 6 mandatory pillars**: `README.md` (root) +
  `docs/{spec, decisions, handbook, tests, workflow}/`. Two
  **optional** pillars are added, `docs/skills/` and `docs/quality/`
  (see §9.1.2). No other pillar (e.g. no separate `tutorials/` or
  `runbooks/`).
- **No agent persona, no code judgment.** The harness ships
  doc-skills only; roles, phases and code-quality audits belong to the
  project. See
  [no-personas-no-code-judgment](../decisions/no-personas-no-code-judgment.md).
- **YOLO by default, no per-skill tool allowlist.** Isolation
  is carried by the calling environment; layering a per-skill
  tool allowlist adds no real security and creates friction
  with the agent.
- **Clean separation between CLI (inert) and skill (intelligent).**
  - **`vaubaan harness init` CLI** = pure mechanics, idempotent,
    invoked by the operator or a script to drop the harness
    rendered for the engines named with `--engines` (mandatory, see
    [engine-choice-mandatory](../decisions/engine-choice-mandatory.md)).
    No intelligence.
  - **`vaubaan harness check` CLI** = layout check of a repo.
  - **`vaubaan harness lint` CLI** = mechanical linters (§10.2)
    run in CI, exit-code-based, *block PRs* that create
    mechanically detectable drift.
  - **Skills (doc-audit + writers)** = the real intelligence; they
    build and maintain the doc *within nominal agent
    invocations*, prescribed by the doc-first rule of `AGENTS.md`. The
    bootstrap of an existing project emerges naturally from the
    "doc-check first" coding workflow — no dedicated `harness-init` skill.
- **Every mechanizable check becomes a CI linter.** Golden rule: if
  a §9.3 criterion can be written as a regex / AST parser / file lookup,
  it is shipped as a **linter** (CI gate, exit-code) in addition to being
  covered by the `doc-audit` skill. The skill keeps only the
  checks that require semantic judgment (§10.3).
- **Harness versioning** = package version tag. The project pins the
  package as a dev dependency so that CI and local renders agree on
  `lint:generated-fresh`.

### 16.2 Still-open questions

- **OQ — Skill signing.** Should the `.skill.md` files be signed (cosign /
  sigstore) to prevent a supply-chain compromise of
  `@vaubaan/harness`? To be settled when we start distributing the
  package publicly.
- **OQ — Cross-project skills shared outside `@vaubaan/harness`.**
  Today: a project that wants a custom skill forks the package.
  Tomorrow: a separate extensions registry? To be reconsidered if
  clients ask for recurring custom work.
- **OQ — `handbook` granularity.** One `handbook/<feature>.md` file
  per feature, or one file per code file? To be experimented with
  during the bootstrap of the Vaubaan handbook.
- **OQ — `tests/` and `workflow/` extensions.** In v1, `tests/` is
  limited to `{integration,e2e}-tests.md` and `workflow/` to
  `coding-workflow.md`. v2 candidates: `tests/load-tests.md`,
  `tests/security-tests.md`, `workflow/release-workflow.md`,
  `workflow/incident-workflow.md`. To be settled when a project has a
  concrete need.
- **OQ — Per-project `doc-audit` config.** The "N commits of drift
  before warning" threshold is configurable via `.harness-overrides/`. Should
  more knobs be exposed (regex of expected subsystem names,
  exclusions, etc.)?

---

_Date: 2026-05-21. Author: rpelissier + Claude (drafting). Status:
draft for review._
