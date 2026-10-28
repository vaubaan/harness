# Vaubaan harness — spec

> **Status:** stable, 2.1 contract. The harness (`@vaubaan/harness`)
> *harnesses* a project directory so that a coding agent (claude-code /
> codex-cli / opencode) is immediately productive in it, and provides
> the skills that *keep alive* the project's **doc**: 6 mandatory
> pillars (README.md at the root + spec + decisions + handbook + tests +
> workflow under `docs/`) and 2 optional ones (skills and quality, see
> §9.1.2).

## 0. Vocabulary

The harness reasons with these words:

- **Harness** — the `@vaubaan/harness` package and its companion CLI
  `vaubaan-harness`, and by extension the set of agent configuration
  files it drops into a target directory: `AGENTS.md` (global
  instructions), skills (capabilities), commands (slash-commands). No
  daemon, no runtime service.
- **Engine** — target coding agent: `claude-code | codex-cli |
  opencode`. Each has its own native skills/commands layout (see §4.3).
- **Skill** — reusable unit of capability. Pivot format
  `*.skill.md` (see §5); rendered per engine.
- **Command** — slash-command invocable by the human or the agent
  (`/doc-audit`, `/spec`, …). Pivot format `*.cmd.md` (see §6).
- **Doc** — umbrella for the persistent artifacts supervised by the
  harness:
  - **README** (`README.md` at the root, outside `docs/`) — entry point
    of the repo: pitch, install, usage, links to the other pillars.
  - **spec** (theoretical vision, "what we want") — `docs/spec/`,
  - **decisions** (ADRs, "what we settled") — `docs/decisions/`,
  - **handbook** (what the code does not say: entry points, traps, settings outside the repo) —
    `docs/handbook/`,
  - **tests** (test plans, "how we guarantee it works") —
    `docs/tests/`, two required files:
    `integration-tests.md` and `e2e-tests.md`,
  - **workflow** (operational process, "how we work") —
    `docs/workflow/`, one required file: `coding-workflow.md` (CI,
    env variants, PR process or direct-push, branches, release).
- **Doc-skill** — cross-cutting doc-maintenance skill (see §7).
  Invocable by the agent or by the human via slash-command.
- **Override** — a local, gitignored customization of the dropped
  harness (adding, disabling or replacing a skill or command, see §11).
- **Manifest** — `.harness-manifest.json`, generated: what the harness
  wrote, for which engines, with fingerprints (see §13.1).

### 0.1 Position

`@vaubaan/harness` is a standalone package: a CLI and a library that
drop files into a project and lint its docs. No coupling to a
third-party service, no session runtime, no protocol with an
orchestrator, no supervision or end-of-turn signal.

Installation and update are invoked explicitly by the user, their CI
or their script; nothing is injected at session start. No engine hook
is installed: the documentation check runs in CI, in the project's git
pre-commit hook and on demand (`vaubaan-harness lint`).

```
@vaubaan/harness (package registry)
        │
        ▼
vaubaan-harness init <target-dir> --engines=<list>
        │  render skills + commands + the umbrella
        ▼
<target-dir>/
  AGENTS.md                      ← umbrella: working rule, project map, checks, doc-skills
  CLAUDE.md                      ← imports `@AGENTS.md` (claude-code only)
  .claude/skills/<id>/SKILL.md   (claude-code)
  .agents/skills/<id>/SKILL.md   (codex-cli — the only repo folder Codex scans)
  .opencode/skills/<id>/SKILL.md (opencode, if the skill is not already exposed by another engine)
  .<engine>/commands/<id>.md     (claude-code, opencode — no commands on the Codex side)
  .harness-manifest.json         ← what was written, committed with the rest
```

The harness does not touch secrets, does no network I/O, and assumes
nothing about the calling environment: it is a pure transformation
`(catalog, project skills, engines, overrides) → dropped files`.

## 1. Vision

The **harness** is the subsystem that:

1. **Standardizes** agent configuration across the 3 supported
   engines. One source per skill (see §5), rendered into each engine's
   native layout.
2. **Ships** a canonical set of doc-skills (see §7) covering the
   project's doc lifecycle: audit, writers for each pillar, drift
   detection.
3. **Ships no agent persona.** No role, no phase, no workflow: the only
   rule it imposes is doc-first, stated in `AGENTS.md`; the team writes
   how it works in `docs/workflow/` and the agents read it.
4. **Enforces its rules via linters.** Every check that can be
   mechanized is an exit-code linter run in CI, in the pre-commit hook
   and on demand, so that a harnessed project cannot merge a PR that
   creates mechanically detectable drift (see §10.2). The `doc-audit`
   skill covers the semantic judgment.
5. **Stays lightweight on the project side.** The generated files and
   the manifest are committed so that a clone has the whole context
   without the harness installed (see §3.3); the project maintains
   nothing by hand outside `docs/`. The harness version is the package
   version the project pins as a dev dependency, so that CI and local
   renders agree.

### 1.1 Explicitly out of scope

- **No project configuration file to maintain.** No `harness.yaml` or
  equivalent; the manifest is generated, never edited.
- **No committed override.** `.harness-overrides/` is gitignored (see
  §11). Knowledge shared by the team goes to `docs/skills/` (§9.1.2);
  a change to the harness itself is an upstream PR.
- **No runtime daemon.** Skills execute in the engine's process, not in
  a harness process.
- **No telemetry.** The CLI only performs local file reads and writes.
- **No skills shared across projects** outside the package: a skill is
  either shipped by `@vaubaan/harness` or kept in one project's
  `docs/skills/`.
- **No hot-reload.** The dropped files are frozen until `init` or
  `update` runs again.
- **No skill generation by the agent.** A skill is written deliberately
  and committed (to the package or to `docs/skills/`).
- **No engine settings, hook, plugin or MCP configuration.** The harness
  never reads, writes or lists `.claude/settings.json`,
  `.codex/hooks.json`, `.codex/config.toml`, `.mcp.json` or
  `.opencode/opencode.json`: those are the project's.
- **No merge.** The harness never merges its content into a file it
  does not own (see §13.1).
- **No code-quality judgment.** No skill audits code; a project that
  wants one keeps it in `docs/skills/`.

## 2. Domain

### 2.1 Hierarchy

```
@vaubaan/harness (package, source of truth)
   ├── skills/<id>.skill.md     # skill pivot format (see §5)
   ├── commands/<id>.cmd.md     # command pivot format (see §6)
   └── templates/               # skeletons of the doc pillars (see §9.2)
   │
   │ rendered with the project's docs/skills/ and .harness-overrides/
   ▼
<target-dir>/
   ├── AGENTS.md                # umbrella
   ├── .<engine>/skills/<id>/SKILL.md
   ├── .<engine>/commands/<id>.md
   └── .harness-manifest.json
```

### 2.2 Definitions

| Entity             | Short definition                                                                                              |
|--------------------|---------------------------------------------------------------------------------------------------------------|
| **Renderer**       | Per-engine module that transforms `*.skill.md` / `*.cmd.md` into the engine's native layout (see §4).        |
| **Skill frontmatter** | YAML header of a `*.skill.md` declaring `id`, `description`, `engines`, `requires`, `tags`. Drives per-engine rendering. |
| **Capability**     | A feature a skill may require from an engine (`multi-step`, `slash-command`, `inline-exec`), see §4.2.       |
| **Generated file** | A file the harness rendered and records in the manifest; owned by the harness until edited or preserved.      |

### 2.3 States (statelessness)

The harness **has no persistent runtime service**. Rendering is
functional; install and update keep the artifacts' provenance and the
necessary backups locally.

- **render(catalog, engines, overrides) → files**: pure function, no
  side effect. Emits every skill and command, filtered only by the
  `engines:` and `requires:` constraints (§4.2).
- **audit(repo) → report**: `doc-audit` skill, executed by the agent.
- **scaffold(repo, pillar) → files**: the writer skills, executed by
  the agent.

Given identical inputs, rendering produces the same contents. Applying
them takes the existing installation and file ownership into account
(§13.1).

## 3. Filesystem layout

### 3.1 In the `@vaubaan/harness` package

```
node_modules/@vaubaan/harness/
├── skills/      # the 8 doc-skills (§7)
├── commands/    # one command per writer and audit skill
├── templates/   # readme, spec, decision, handbook, integration-tests,
│                # e2e-tests, coding-workflow, code-quality (§9.2)
└── (CLI, renderers, parser, linters)
```

### 3.2 In the target directory (after `init`)

```
<target-dir>/
├── AGENTS.md                         # umbrella: working rule, project map, checks, doc-skills
├── CLAUDE.md                         # imports `@AGENTS.md` (claude-code only)
├── .harness-manifest.json            # what the harness wrote, with fingerprints
├── .claude/                          # if engine=claude-code
│   ├── skills/<id>/SKILL.md
│   └── commands/<id>.md
├── .agents/skills/<id>/SKILL.md      # if engine=codex-cli (also read by opencode)
├── .opencode/                        # if engine=opencode
│   ├── commands/
│   └── skills/                       # only if no other engine exposes the skills
└── .harness-overrides/               # optional, gitignored (see §11)
```

The harness writes nothing under `.codex/`: Codex reads its skills from
`.agents/skills/` and has no command files.

### 3.3 In the project repo (what persists vs gitignored)

```
project/
├── README.md                         # ← COMMITTED (README pillar, root)
├── docs/                             # ← COMMITTED (the other pillars)
├── AGENTS.md, CLAUDE.md, .<engine>/  # ← COMMITTED (generated)
├── .harness-manifest.json            # ← COMMITTED (generated)
├── .gitignore                        # contains .harness-overrides/ and .vaubaan/
├── .harness-overrides/               # ← GITIGNORED (see §11)
└── .vaubaan/                         # ← GITIGNORED (skill reports)
```

The generated files are **committed**, like any generated code: a clone
has the whole context without the harness installed. Two linters keep
this honest. `lint:gitignore-harness` requires `.harness-overrides/`
and `.vaubaan/` to be ignored and refuses a `.gitignore` entry for a
generated path. `lint:generated-fresh` renders the harness with the
engines and overrides recorded in the manifest and fails when a
committed generated file differs from the render, is missing, or is no
longer rendered: the fix is always to edit the source (`docs/` or the
overrides), run `update`, and commit. Decision:
[generated-files-committed](../decisions/generated-files-committed.md).

## 4. Multi-engine composition

### 4.1 Pivot format

One `*.skill.md` (or `*.cmd.md`) source → 3 renderers → 3 native
layouts. Renderers are pure: no I/O, no state, idempotent. Decision:
[multi-engine-pivot-format](../decisions/multi-engine-pivot-format.md).

```
                       ┌── claude-code renderer ──► .claude/skills/<id>/SKILL.md
*.skill.md ─► parser ──┼── codex-cli renderer  ──► .agents/skills/<id>/SKILL.md
                       └── opencode renderer   ──► .opencode/skills/<id>/SKILL.md
```

### 4.2 Capabilities matrix

A skill declares the capabilities it needs in `requires:`. Which
engine supports which capability, fully or in degraded mode, is
declared once in the package, never in the skills:

| Capability                     | claude-code | codex-cli | opencode |
|--------------------------------|:-----------:|:---------:|:--------:|
| Slash command                  |     ✅      |    ✅     |    ✅    |
| Multi-step workflow (subagent) |     ✅      |    ⚠️     |    ✅    |
| Inline code execution          |     ✅      |    ✅     |    ✅    |

- A required capability the engine does not support → the skill is
  **skipped** for that engine, with a warning. No fatal error.
- A required capability supported in degraded mode (⚠️) → the skill is
  **rendered**, with an informational warning at render time.

### 4.3 Native engine layouts (reference)

| Engine        | Skill path                          | Command path                  | Frontmatter |
|---------------|-------------------------------------|-------------------------------|-------------|
| claude-code   | `.claude/skills/<id>/SKILL.md`      | `.claude/commands/<id>.md`    | YAML        |
| codex-cli     | `.agents/skills/<id>/SKILL.md`      | — (the skill is invoked by name) | YAML     |
| opencode      | `.opencode/skills/<id>/SKILL.md`    | `.opencode/commands/<id>.md`  | YAML        |

These are the paths each engine's documentation declares it reads.
OpenCode also reads `.claude/skills/` and `.agents/skills/`: when
another rendered engine already exposes a skill, the `.opencode/skills/`
copy is omitted. Decision:
[engine-native-layouts-1-0](../decisions/engine-native-layouts-1-0.md).

## 5. `*.skill.md` format

```markdown
---
id: doc-audit
description: |
  Audits the completeness and freshness of the doc.
engines: [claude-code, codex-cli, opencode]  # omit = all
requires: [multi-step]                       # required engine capabilities
tags: [audit, doc]
---

# Doc Audit

You are invoked to audit the completeness of the project's doc:

- `docs/spec/`     — theoretical vision (what we want)
- `docs/decisions/` — ADRs (what we settled)
- `docs/handbook/`   — what the code does not say (entry points, traps, procedures)
…
```

**Writing rules**:

- **Strict frontmatter.** An unknown or misspelled field fails the
  parse with a precise message; a skill whose frontmatter does not
  validate is never loaded or rendered. The error surfaces when the
  harness is built or run, not when the engine invokes the skill.
- Body = free-form Markdown, the prompt rendered to the agent.
- No conditional logic in the body (no templating): per-engine
  variation goes through the frontmatter (`engines:`, `requires:`).

## 6. `*.cmd.md` format

```markdown
---
id: doc-audit
trigger: /doc-audit
invokes_skill: doc-audit
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

Commands are **thin**: a `slash → skill + args` binding. All the logic
lives in the skill. Same strict-frontmatter rule as §5.

## 7. Skills shipped

One category: **doc-skills**, all dropped into the target directory.
The harness ships no agent persona and no code-quality audit (see
[no-personas-no-code-judgment](../decisions/no-personas-no-code-judgment.md)).

### 7.1 Doc-skills

| ID                          | Role                                                                                                                 |
|-----------------------------|----------------------------------------------------------------------------------------------------------------------|
| `doc-audit`                 | Audits the completeness of the doc (see §10).                                                                  |
| `spec-writer`               | Human-guided, progressive wizard to write / update a `docs/spec/<name>.md` file, section by section.                 |
| `decision-record-writer`    | Wizard to write an ADR under `docs/decisions/<slug>.md` (no numbering — see §9.1). Detects implicit decisions in the current diff.  |
| `handbook-writer`           | Documents the actual implementation under `docs/handbook/<name>.md`. Reads the code, proposes, the human validates.     |
| `test-plan-writer`          | Updates `docs/tests/integration-tests.md` and/or `docs/tests/e2e-tests.md`. Scope, stack, conventions and known gaps; never the covered scenarios. |
| `workflow-writer`           | Updates `docs/workflow/coding-workflow.md`. Reads the repo's CI/CD config, the package manifest scripts and the branch/PR config, proposes the required sections (CI / env / PR / branches / release) and the optional ones (languages). |
| `readme-writer`             | Maintains `README.md` at the root. Syncs the links to the other pillars; makes sure pitch + quick start stay up to date vs the code. |
| `drift-detector`            | Detects code ↔ doc divergences.                                                                                      |

Their evolution is versioned by the package version. Only the
`engines:` and `requires:` constraints (§4.2) filter a skill out of an
engine render. A skill says *how* to write or check a pillar, never
*when*: the when is the team's workflow.

## 8. Composition: umbrella + skills + commands

`vaubaan-harness init <target-dir> --engines=<list>` performs one drop
for all the named engines:

- **The engine list is mandatory**, with no default and no "all"
  shortcut: one or several of `claude-code`, `codex-cli`, `opencode`,
  comma-separated. A missing or empty value fails and lists the three.
  Nothing is rendered for a tool the project does not use; `update`
  keeps the engines recorded in the manifest and takes no engine
  option.
- **Rendered content** lives directly under the engines' native folders
  (`.claude/`, `.agents/`, `.opencode/`). No indirection.
- **Umbrella `AGENTS.md`** at the root, engine-neutral, in four
  sections: the project map (where each pillar lives, including the
  optional ones when present), the doc-first rule, the checks (run
  `lint` before committing, never edit a generated file by hand) and a
  compact list of the doc-skills with their slash-command when one
  exists. The engines discover skills natively.
- **`CLAUDE.md`** at the root if claude-code is included, reduced to
  the `@AGENTS.md` import.

## 9. Doc pillars — persistent contract

### 9.1 Layout

```
project/
├── README.md                         # README pillar (root, outside docs/)
└── docs/
    ├── spec/<subsystem>.md           # 1 file per major subsystem
    ├── decisions/
    │   ├── README.md                 # ADR index
    │   └── <slug>.md                 # no numbering (see §9.1.1)
    ├── handbook/<slug>.md            # no numbering (see §9.1.1)
    ├── tests/
    │   ├── integration-tests.md      # required
    │   └── e2e-tests.md              # required
    ├── workflow/
    │   └── coding-workflow.md        # required
    ├── skills/<id>.skill.md          # OPTIONAL (see §9.1.2)
    └── quality/code-quality.md       # OPTIONAL (see §9.1.2)
```

- The `README` pillar lives at the root (universal convention of
  package registries); it is the only pillar outside `docs/`.
- The `tests/` pillar is constrained to two required files. Unit tests
  live next to the code and are not documented separately.
- The `workflow/` pillar has one required file. Further files
  (`release-workflow.md`, …) are an open question (§15.2).
- No other pillar (no separate `tutorials/` or `runbooks/`).

### 9.1.1 No numbering for `decisions/` and `handbook/`

Files under `docs/decisions/` and `docs/handbook/` are named
`<slug>.md` (kebab-case), **without a numeric prefix**:

- **No implicit precedence.** The file order carries nothing; each
  file is independent, not a chapter in a sequence.
- **Evolution without renaming.** Adding or rewriting a file breaks no
  link.
- **The slug is the durable identity.** The writer skills always
  generate slugs, never numbers.

The decision log holds only the decisions in force: a replaced decision
is deleted and its option moves to the Rejected alternatives of the new
one (see
[decisions-as-current-state](../decisions/decisions-as-current-state.md)).

### 9.1.2 Optional pillars

Two pillars are added to the six mandatory ones. Their absence is
never an error; their presence commits to a form contract.

**`skills/`** — domain skills versioned with the project (a plugin
recipe, a migration runbook, a review checklist, a team persona):

- Files `docs/skills/*.skill.md` are discovered at `init` and `update`,
  use the frontmatter schema of §5, and are rendered alongside the
  shipped skills into every target engine.
- Merge order: shipped, then project, then overrides (§11). A project
  skill with the id of a shipped skill replaces it; `disable.yaml` can
  disable any skill, project skills included.
- No slash command is generated for a project skill; it is invoked by
  name. `AGENTS.md` lists the pillar in its project map when it holds
  skills.

**`quality/`** — the code-quality rules *specific to the project*, in a
single required file, `code-quality.md`. The file is *normative*: it
states what the project requires, not what the code does today. It has
three required sections:

1. **Mechanical checks** — the project's automated tools, their
   configuration file and what each covers. The configuration remains
   the source of truth: this section *points* to it, it copies no rule.
2. **Project rules** — the judgment rules that no tool checks: naming,
   decomposition, chosen patterns, thresholds.
3. **Accepted deviations** — the generic rules the project chooses not
   to follow, each with its reason.

Boundaries with the other pillars (anti-drift, see §9.3): the *why* of
a structural choice remains an ADR, which `code-quality.md` points to;
the implementation remains in the handbook; generic principles are not
restated; CI commands remain in `coding-workflow.md`.

When the file exists, `AGENTS.md` lists it in the project map and every
agent reads it before writing or auditing code. The file declares no
`tracks:`: like an ADR, it sets a norm and does not follow the code.

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
  alternatives, about 40 lines, only for a decision that passes the
  admission test (costly to reverse, real alternative weighed,
  outlives the ticket).
- **handbook.md**: only what the code does not say — Start here +
  Invariants + Traps + Outside the repo + Procedures + Debug, each
  optional; 30-60 lines.
- **integration-tests.md** / **e2e-tests.md**: Scope + Stack +
  Conventions + Known gaps; 20-50 lines. Never a list of covered
  scenarios: the test titles are their source of truth.
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
- **README links**: the README must link to `docs/spec/`,
  `docs/handbook/`, `docs/workflow/coding-workflow.md`. Otherwise → ⚠️.
- **Spec coverage**: every major subsystem has a spec. A subsystem is
  a package of a multi-package repo or a top-level route of an app,
  unless the project's `doc-audit` override lists them.
- **Explicit decisions**: `doc-audit` flags recent commits whose
  message carries decision hints ("decided to", "switched from X to
  Y", "removed X because") without a matching ADR.
- **Handbook freshness**: each handbook declares the code it depends on
  (`tracks: [...]`). A handbook older than its tracked files by more
  than a threshold (default N commits) → warning.
- **Tests presence**: the two required files (`integration-tests.md`,
  `e2e-tests.md`) **must** exist. Gap → ❌.
- **Tests coverage cross-check**: each spec is exercised by at
  least one integration or E2E test file, or listed under "Known
  gaps" in a test plan. Otherwise → ⚠️ "spec without tests".
- **Tests freshness**: same `tracks: [...]` criteria as the handbook —
  a test plan that refers to code that has disappeared = ❌.
- **Workflow presence**: `docs/workflow/coding-workflow.md` **must**
  exist and cover the 5 core topics (CI, env variants, PR process,
  branches, release). Gap → ❌.
- **Workflow freshness**: `coding-workflow.md` `tracks:` the CI/CD
  config files and the package manifest. Drift → ⚠️.
- **Quality (optional pillar)**: if `docs/quality/` exists,
  `code-quality.md` **must** exist with its three required sections
  (§9.1.2). Gap → ❌. Content that copies an ADR, a handbook, a tool's
  configuration or generic principles → ⚠️ (pillar boundary).
- **Cross-link consistency**: a spec has at least one decision, one
  handbook or a mention in the tests; a decision is referenced by at
  least one other doc. Otherwise → orphan.
- **Pillar boundaries — anti-drift between pillars.** The critical
  point where the doc drifts if it is not audited. Heuristics (regex +
  the agent's judgment):
  - **spec/** stays *tech-agnostic*: mentions of concrete
    libraries/frameworks/runtimes, code file paths or code blocks →
    move to `handbook/` or an ADR. The effective blocklist is the one
    of `lint:spec-tech-agnostic`.
  - **handbook/** says what the code does not: a file that mentions no
    code file → move to `spec/`; a file that paraphrases the code →
    cut.
  - **decisions/** holds only decisions that pass the admission test
    (§9.2), with the 4 sections. An ADR that is a product rule, an
    implementation detail or a release record → move to the matching
    pillar and delete the ADR.
  - Any commit that introduces a library or an architectural choice
    without an ADR is caught by "Explicit decisions".

## 10. Doc audit: skill + linters

The §9.3 criteria are checked on **two complementary levels**, shipped
together. Decision:
[linters-mechanical-vs-skills](../decisions/linters-mechanical-vs-skills.md).

- **§10.1 `doc-audit` skill** — the judgment audit, executed by an
  agent (pillar boundaries, semantic freshness, implicit decisions).
  Output = Markdown report.
- **§10.2 Mechanical linters** — the exit-code version of the checks
  that can be mechanized. Run in CI, they **block the merge** if red.
- **§10.3 Division of labor** between the two.

### 10.1 `doc-audit` skill

Reads `docs/` and the root README, parses each file's frontmatter, runs
the §9.3 checks. Output: a Markdown report under
`.vaubaan/reports/doc-audit.md` in the target directory (or at a path
passed as argument): one section per pillar with ✅ / ⚠️ / ❌ items, then
cross-links, pillar boundaries and recommendations.

Global verdict: `done` if zero `❌`, otherwise `needs-human`.

### 10.2 Mechanical linters (CI gates)

Each linter is a pure function `(repoRoot) → issues`, with no LLM and no
network. `vaubaan-harness lint` runs them all with an aggregated exit
code: `0` if no issue of severity `error`, `1` otherwise. Options
filter by pillar or by linter id and choose a text or JSON output.

| Linter ID                       | Targeted pillar(s)       | Check                                                                                                                                                     | Severity      |
|---------------------------------|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| `lint:readme-presence`          | README                   | `README.md` exists at the root.                                                                                                                          | error         |
| `lint:readme-sections`          | README                   | `README.md` contains the template sections (regex on headers).                                                                                           | error         |
| `lint:doc-layout`               | all                      | `docs/{spec,decisions,handbook,tests,workflow}/` exist.                                                                                                  | error         |
| `lint:cardinal-files`           | tests, workflow          | `tests/integration-tests.md`, `tests/e2e-tests.md`, `workflow/coding-workflow.md` exist.                                                                  | error         |
| `lint:decision-schema`          | decisions                | Each ADR has the 4 sections Context + Decision + Consequences + Rejected alternatives (regex headers).                                                     | error         |
| `lint:adr-no-tracks`            | decisions                | No ADR declares a non-empty `tracks:` (an ADR states a decision, it does not follow the code).                                                          | error         |
| `lint:frontmatter-tracks`       | handbook, tests, workflow | Each file declares `tracks: [...]` in frontmatter and all tracked paths exist in the repo.                                                               | error         |
| `lint:tracks-drift`             | handbook, tests, workflow | The doc file is older than its tracked files by more than N commits (configurable).                                                                      | warning       |
| `lint:spec-tech-agnostic`       | spec                     | Blocklist of tech keywords (frameworks, runtimes, infra providers — effective list in the source code) **forbidden** in `spec/` files.                   | error         |
| `lint:spec-has-content`         | spec                     | `docs/spec/` contains at least one `.md` file (warns if the directory exists but is empty).                                                              | warning       |
| `lint:cross-links`              | all                      | All relative Markdown links resolve to an existing file.                                                                                                 | error         |
| `lint:orphan-decisions`         | decisions                | Each ADR is referenced by at least one other doc file.                                                                                                   | warning       |
| `lint:gitignore-harness`        | repo root                | `.gitignore` excludes `.harness-overrides/` and `.vaubaan/`, and ignores none of the generated paths (`AGENTS.md`, `CLAUDE.md`, engine folders, manifest). | error         |
| `lint:quality-schema`           | quality (optional)       | If `docs/quality/` exists: `code-quality.md` exists and contains the 3 required sections (regex headers). No effect if the directory is absent.           | error         |
| `lint:generated-fresh`          | repo root                | When a manifest exists: every generated file equals the current render for the recorded engines and overrides; none is missing or stale.                 | error         |

Section headings are matched in English (`Context`, `Decision`,
`Consequences`, `Rejected alternatives`; `Mechanical checks`, `Project
rules`, `Accepted deviations`) and, for projects documented in French,
in French, accented or not, each section independently. Messages name
the English heading.

The project wires the same command into its CI (the gate) and its git
pre-commit hook (zero token cost: the agent sees a failed commit in its
own flow). No engine hook is installed. Decision:
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
| Semantic freshness (did the code really change?)            | partial (count)   |        ✅         |
| Doc move / refactor suggestions                             |        ❌         |        ✅         |

**Golden rule**: every check that can be written as a regex, a parser
or a file comparison *must* become a linter, and therefore a CI gate;
the skill keeps the checks that require judgment.

## 11. Gitignored overrides

A project can override the harness locally via `.harness-overrides/`
in its worktree. **Gitignored by design, never committed.** Typical
uses: iterating on a skill before proposing it upstream, temporary
debugging, disabling a shipped skill.

```
project/.harness-overrides/
├── skills/
│   ├── my-custom-skill.skill.md      # addition
│   └── doc-audit.skill.md            # replaces the shipped version
├── commands/
└── disable.yaml                      # disable: [drift-detector]
```

Overrides apply last: `shipped + project skills + overrides_add −
overrides_disable`, and on collision the override wins.

**Why gitignored?** So that every harnessed project behaves like the
harness version it pins. Knowledge the team shares belongs in
`docs/skills/` (§9.1.2); an improvement to the harness is an upstream
PR.

## 12. Security

The harness carries no security model of its own — it drops text
files. Execution security is carried by **whoever invokes the harness
and launches the engine** (CI runner, orchestrator, human).

- **YOLO by design on the skills side.** No skill declares a tool
  allowlist; the shipped skills assume a bypass-permissions mode or
  equivalent. The blast radius is defined by the isolation of the
  calling environment; a per-skill allowlist would add friction, not
  security.
- **No arbitrary skill injection at render.** The CLI renders only what
  the package embeds, the project's `docs/skills/` and the
  `.harness-overrides/` present in the target directory. No network
  loading. A malicious override already requires write access to the
  target directory.
- **No secret access.** The CLI reads and writes text files only; it
  touches no environment secret and no vault.
- **Every path is validated before any mutation.** `init`, `update` and
  `uninstall` check the whole batch of paths first — relative,
  contained in the target directory, inside the managed locations, no
  `..`, no absolute path, no symbolic component under the target root
  (the root itself may be a link). One invalid entry aborts the
  operation before the first file is touched, so a tampered manifest
  cannot write or delete outside the project. These checks protect the
  inspected state; they are not a lock against a concurrent process.
- **Signed skills?** Not yet; the supply chain relies on the registry
  and the lock-file hash (§15.2).

## 13. UX

### 13.1 For the harnessed project

The operator (human, script, CI or third-party agent) runs `init` once,
then `update`. The CLI is pure mechanics; the intelligence lives in the
skills.

**First install**: `vaubaan-harness init <target-dir> --engines=<list>`
renders `AGENTS.md`, the doc-skills and the commands each engine
supports, applies the overrides, writes the manifest, and ends with the
next step: commit the generated files. Options let the operator choose
the overrides' parent directory, keep generated files as the project's
(`--preserve`) and place the backup.

Re-running `init` refreshes the dropped files and keeps the choices
recorded by previous runs (preserved files, overrides folder); it is
also how the engines are changed.

**Ownership.** `init` and `update` share one installation planner and
never overwrite, merge or delete a file the harness does not own. A
generated path already holding a file the harness did not write, or a
generated file edited since it wrote it, stops the command before any
write; all conflicts are reported at once. The operator moves the
content to `docs/` or `.harness-overrides/`, or keeps the file as the
project's with `--preserve`. There is no `--force`. Decision:
[safe-init](../decisions/safe-init.md).

**Preserving the project during an update or a removal:**

- A file that has become unnecessary is removed only when the harness's
  ownership of it is established; without sufficient proof,
  preservation prevails.
- `uninstall` removes a generated file only if it is unchanged since
  the harness wrote it; an edited one is kept with a warning.
- Files 1.x wrote or edited entry by entry (MCP files, engine settings)
  are released to the project: they leave the manifest with a warning
  and stay in place.

#### Updating an existing installation

`update [target-dir]` moves a known installation to the harness
version that runs it. It neither looks for nor downloads a newer
version, and does not touch the project's dependency on the package.
It recognizes older installations and keeps the engines, the preserved
files, the project skills and the applicable overrides.

- The preview modifies nothing, not even a backup folder.
- Before applying, destinations and conflicts are checked, then a
  private backup of the touched files is created outside the project.
  An apply error rolls back the touched files; a restoration problem is
  reported with the path of the kept backup.
- The manifest keeps the provenance (fingerprint) of each generated
  file. A managed file modified since the last generation and different
  from the new rendering blocks the update before writing. Older
  installations without fingerprints get a warning before their managed
  files are regenerated.
- `--preserve` transfers a generated file to the project and excludes
  it from future generations; the choice is remembered. The manifest
  cannot be preserved.

**Layout check**: `vaubaan-harness check <repo>` exits `0` if `docs/`
exists and `.gitignore` covers `.harness-overrides/` and `.vaubaan/`
without ignoring a generated file, `1` with a diagnostic otherwise.

**Lint**: `vaubaan-harness lint` (§10.2), wired into the project's CI
and pre-commit hook.

**Bootstrapping the doc of an existing project** is not a CLI: the
agent, following the doc-first rule of `AGENTS.md`, finds the gaps with
`doc-audit` and fills them with the writer skills.

### 13.2 For skill developers (contributors)

1. Edit a skill in the harness repository.
2. Preview with `vaubaan-harness render --engines=<list> --out=<dir>`
   (no overrides applied).
3. Try it on a project by copying it to the project's
   `.harness-overrides/skills/`, then `update`.
4. Propose it upstream.

## 14. Tests

- **Unit**: the parser (strict frontmatter), each renderer (pivot
  fixture → expected native layout), the capabilities policy (skip vs
  degraded).
- **Integration**: `init`, `update`, `uninstall` and `check` on target
  directories in various states (empty, existing user files, edited
  generated files, old manifests, unsafe paths); each linter on a
  passing and a failing fixture; `lint:generated-fresh` passing after
  `init` and failing after a hand edit.
- **E2E**: the packed package installed and run as a user would, per
  engine; an override replacing a shipped skill in the render.
- **Self-application**: the harness repository is harnessed by itself
  and passes its own linters.

## 15. Decisions in force & open questions

### 15.1 Decisions in force

The structural decisions are listed in
[docs/decisions/](../decisions/README.md); this spec links each one
where it applies.

### 15.2 Still-open questions

- **OQ — Skill signing.** Should the `.skill.md` files be signed to
  protect the supply chain of `@vaubaan/harness`?
- **OQ — Skills shared across projects** outside the package: a
  separate extensions registry? To reconsider if projects ask for it.
- **OQ — `tests/` and `workflow/` extensions.** Candidates:
  `tests/load-tests.md`, `tests/security-tests.md`,
  `workflow/release-workflow.md`, `workflow/incident-workflow.md`. To
  settle when a project has a concrete need.
- **OQ — Per-project `doc-audit` config.** Beyond the drift threshold,
  should more knobs be exposed (expected subsystem names, exclusions)?
