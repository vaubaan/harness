# Vaubaan harness — spec

> **Status:** stable, 3.0 contract. The harness (`@vaubaan/harness`)
> *harnesses* a project directory so that a coding agent (claude-code /
> codex-cli / opencode) is immediately productive in it, and provides
> the skills that *keep alive* the project's **doc**: a core of two
> pillars (README.md at the root + spec under `docs/`) and the pillars a
> project adds when it needs them (decisions, handbook, tests, workflow,
> quality, skills, intents, profiles; see §9.1.2).

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
  (`/harn-doc-audit`, `/harn-spec`, …). Pivot format `*.cmd.md` (see §6).
- **Meta database** — `docs/` and the views the harness renders from it:
  what the code cannot say, in a small fixed set of Markdown files that
  point to the code for everything else. The **code database** is the
  rest of the repo: sources, tests, configs. Both are committed; the
  harness is the schema, the integrity constraints and the views of the
  meta database, and never reads the code database.
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
    env variants, PR process or direct-push, branches, release),
  - **intents** (what the user does and wants, at every scale, one
    tree anchored to the code) — `docs/intents/` (see §9.1.3),
  - **profiles** (who the project serves, their pains and gains) —
    `docs/profiles/` (see §9.1.4).
- **Pillar** — one kind of information the code cannot carry, with its
  place, its form contract, its linters and its writer skill. README and
  spec are the **core**, always active; every other pillar is active
  when its folder under `docs/` exists and inactive otherwise (see
  §9.1.2).
- **Doc-skill** — cross-cutting doc-maintenance skill (see §7).
  Invocable by the agent or by the human via slash-command.
- **Override** — a local, gitignored customization of the dropped
  harness (adding, disabling or replacing a skill or command, see §11).
- **Manifest** — `.harness-manifest.json`, generated: what the harness
  wrote, for which engines, with fingerprints (see §13.1).
- **Generated file** — a file the harness rendered and records in the
  manifest; owned by the harness until edited or preserved (see §13.1).
- **Preserved file** — a generated path the operator keeps as the
  project's own (`--preserve`); excluded from future renders.
- **Intent** — what a user wants, verb + object, for an actor, at any
  level: a heading of an intent file under `docs/intents/`. The file is
  the level-1 intent, every deeper heading a sub-intent, so the pillar is
  one tree of intents. An intent with no sub-intent is terminal: it
  carries the fields and is born `proposed` with acceptance criteria,
  `implemented` when delivered with anchors.
- **Anchor** — a pointer from a terminal intent to the code
  and tests that realize it; the `tracks:` syntax, per terminal intent
  (see §9.1.3).
- **Profile** — a kind of user the project serves: a file under
  `docs/profiles/`, a `hypothesis` until evidence validates it. Never an
  agent role (see §9.1.4).
- **Pain** — what hurts or blocks a profile today, a named bullet of its
  file. A terminal intent declares the pains it relieves.
- **Gain** — an outcome a profile hopes for, a named bullet of its file.
  A terminal intent declares the gains it delivers.
- **Context graph** — `.vaubaan/graph.json`: the meta database as one
  index of nodes (docs, sections, vocabulary terms, intents, decisions,
  linters, skills, the paths they point to) and typed edges, each node
  with its domain, its source file and line, and its lint issues.
  Derived, local, never edited (see §10.4).
- **View** — a page rendered from the context graph that a human reads
  instead of the Markdown. Never a source (see §10.4).
- **Review session** — a bounded period during which the view follows
  the docs live while the human talks to the agent or comments; it
  starts from a snapshot of the docs and ends kept or discarded, never
  committed (see §10.4).
- **Comment** — a note the human pins to a node of the view during a
  review session; the agent answers in the same thread with what it
  changed (see §10.4).
- **Lesson** — a rule proposed from the patches that reviews keep
  asking for, with its evidence. Accepted, it becomes a line in a
  project pillar (see §10.5).

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

### 0.2 Domains

Three domains, never mixed:

- **Harness** — the package: the grammar of the pillars, the linters
  and their defaults, the shipped skills as procedures (how to write,
  never what), the view and the review server. It holds no rule, word
  or choice specific to a project and changes through an upstream
  contribution.
- **Project** — what the repo commits: `docs/`, `docs/skills/`, the
  lint configuration, and the generated files as the harness's output,
  never as a source. The only destination of what a skill writes.
- **Local** — what one machine keeps out of version control:
  `.vaubaan/` (context graph, view, review sessions, lesson candidates,
  reports) and `.harness-overrides/`. Disposable; nothing there is a
  source of truth.

A review or a lesson about the project lands in a project pillar; one
about the harness becomes an upstream issue draft, never an edit of a
generated file. The domain follows where a file lives, not its subject:
in the harness's own repository, the skill sources are project code.

## 1. Vision

The **harness** is the subsystem that:

1. **Standardizes** agent configuration across the 3 supported
   engines. One source per skill (see §5), rendered into each engine's
   native layout.
2. **Ships** a canonical set of doc-skills (see §7) covering the
   project's doc lifecycle: audit, writers for each pillar, drift
   detection, and two skills about the harness itself: how to use it and
   how to move to a new version.
3. **Ships no agent persona.** No role, no phase, no workflow: the only
   rule it imposes is doc-first, stated in `AGENTS.md`; the team writes
   how it works in `docs/workflow/` and the agents read it.
4. **Enforces its rules via linters.** Every check that can be
   mechanized is an exit-code linter run in CI, in the pre-commit hook
   and on demand, so that a harnessed project cannot merge a PR that
   creates mechanically detectable drift (see §10.2). The `harn-doc-audit`
   skill covers the semantic judgment.
5. **Asks for nothing a project does not need yet.** A project that
   just started is harnessed with a README; each other pillar is added
   the day it helps, with its linters and its skill (see §9.1.2). An
   inactive pillar leaves no trace: no check, no skill, no command.
6. **Stays lightweight on the project side.** The generated files and
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
  a harness process. The one harness process that outlives a command is
  the server of a review session (§10.4), started and stopped with it
  and reachable only from the local machine.
- **No telemetry.** The CLI only performs local file reads and writes
  and serves a review session on the local machine; it calls no network
  service.
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
  `.opencode/opencode.json`: those are the project's. An engine's
  conversation history is read, never written, and only to collect
  lessons when the project enables that source (§10.5).
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

- **render(catalog, engines, overrides, active pillars) → files**: pure
  function, no side effect. Emits the skills and commands whose
  `pillars:` include an active pillar (§9.1.2), filtered by the
  `engines:` and `requires:` constraints (§4.2).
- **audit(repo) → report**: `harn-doc-audit` skill, executed by the agent.
- **scaffold(repo, pillar) → files**: the writer skills, executed by
  the agent.

Given identical inputs, rendering produces the same contents. Applying
them takes the existing installation and file ownership into account
(§13.1).

## 3. Filesystem layout

### 3.1 In the `@vaubaan/harness` package

```
node_modules/@vaubaan/harness/
├── skills/      # the shipped skills (§7)
├── commands/    # one command per writer and audit skill
├── templates/   # readme, spec, decision, handbook, integration-tests,
│                # e2e-tests, coding-workflow, code-quality, intent,
│                # profile, and the starter indexes (§9.2)
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
├── docs/                             # ← COMMITTED (the other pillars; the
│                                     #   indexes docs/intents/README.md and
│                                     #   docs/profiles/README.md are generated)
├── AGENTS.md, CLAUDE.md, .<engine>/  # ← COMMITTED (generated)
├── .harness-manifest.json            # ← COMMITTED (generated)
├── .gitignore                        # contains .harness-overrides/ and .vaubaan/
├── .harness-overrides/               # ← GITIGNORED (see §11)
└── .vaubaan/                         # ← GITIGNORED (skill reports, context graph,
                                      #   view, review sessions, lessons)
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
id: harn-doc-audit
description: |
  Audits the completeness and freshness of the doc.
engines: [claude-code, codex-cli, opencode]  # omit = all
requires: [multi-step]                       # required engine capabilities
pillars: [handbook, tests]                   # omit = always rendered
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

- **Prefixed ids.** Every skill and command the package ships has an
  id starting with `harn-`, so that none collides with a project's or a
  user's own in the folders the engines share; a command's trigger is
  `/` followed by its id. Project skills and overrides are free of the
  rule. Decision: [harn-prefix](../decisions/harn-prefix.md).
- **Strict frontmatter.** An unknown or misspelled field fails the
  parse with a precise message; a skill whose frontmatter does not
  validate is never loaded or rendered. The error surfaces when the
  harness is built or run, not when the engine invokes the skill.
- Body = free-form Markdown, the prompt rendered to the agent.
- No conditional logic in the body (no templating): per-engine
  variation goes through the frontmatter (`engines:`, `requires:`).
- `pillars:` lists the pillars the skill serves: it is rendered while at
  least one of them is active in the project (§9.1.2). Omitted, the
  skill is always rendered; a project skill or an override may use the
  field too.

## 6. `*.cmd.md` format

```markdown
---
id: harn-doc-audit
trigger: /harn-doc-audit
invokes_skill: harn-doc-audit
args:
  - name: scope
    type: enum
    values: [spec, decisions, handbook, all]
    default: all
description: Audits the project's doc completeness (scope of your choice).
---

# /harn-doc-audit

When the human or the agent invokes `/harn-doc-audit [scope]`, load the
`harn-doc-audit` skill with the scope passed as argument.
```

Commands are **thin**: a `slash → skill + args` binding. All the logic
lives in the skill. An argument is required unless it declares
`required: false`; the command then runs without it too. Same strict-frontmatter rule as §5.

## 7. Skills shipped

Two categories: the **doc-skills**, each rendered while a pillar it
serves is active, and the two **harness skills**, always rendered. The
harness ships no agent persona and no code-quality audit (see
[no-personas-no-code-judgment](../decisions/no-personas-no-code-judgment.md)).

### 7.1 Doc-skills

| ID                          | Pillars | Role                                                                                                       |
|-----------------------------|---------|------------------------------------------------------------------------------------------------------------|
| `harn-doc-audit`                 | always | Audits the completeness of the doc (see §10).                                                                  |
| `harn-spec-writer`               | always | Human-guided, progressive wizard to write / update a `docs/spec/<name>.md` file, section by section.                 |
| `harn-decision-record-writer`    | decisions | Wizard to write an ADR under `docs/decisions/<slug>.md` (no numbering — see §9.1). Detects implicit decisions in the current diff.  |
| `harn-handbook-writer`           | handbook | Documents the actual implementation under `docs/handbook/<name>.md`. Reads the code, proposes, the human validates.     |
| `harn-test-plan-writer`          | tests | Updates `docs/tests/integration-tests.md` and/or `docs/tests/e2e-tests.md`. Scope, stack, conventions and known gaps; never the covered scenarios. |
| `harn-workflow-writer`           | workflow | Updates `docs/workflow/coding-workflow.md`. Reads the repo's CI/CD config, the package manifest scripts and the branch/PR config, proposes the required sections (CI / env / PR / branches / release) and the optional ones (languages). |
| `harn-readme-writer`             | always | Maintains `README.md` at the root. Syncs the links to the other pillars; makes sure pitch + quick start stay up to date vs the code. |
| `harn-drift-detector`            | handbook, tests, workflow, intents | Detects code ↔ doc divergences.                                                                                      |
| `harn-canvas-review`             | always | Runs a review session (§10.4): opens the view, keeps it live while the human talks or comments, applies each comment to its pillar with that pillar's writer rules, answers in the thread. Writes only to the project domain (§0.2). |
| `harn-self-improve`              | always | Proposes lessons (§10.5): groups the patch events `lessons collect` extracted, proposes one rule per recurring patch with its evidence, domain and pillar; writes an accepted rule with the pillar's writer rules. |
| `harn-intent-writer`             | intents, profiles | Writes or updates `docs/intents/<slug>.md` one node at a time (§9.1.3): greenfield (three questions) or mature (reads the code's entry points, proposes anchored terminal intents). `/harn-intent <verb + object>` adds a `proposed` intent with its acceptance criteria before any code. Writes or updates a profile under `docs/profiles/` and names, on an intent, the profile it serves and the pain it relieves (§9.1.4). |

Their evolution is versioned by the package version. The `pillars:`
field (§5, §9.1.2) and the `engines:` and `requires:` constraints (§4.2)
filter a skill out of a render; a command follows its skill. A skill
says *how* to write or check a pillar, never *when* the team does it:
the when is the team's workflow.

### 7.2 Harness skills

Two skills are about the harness, not about a pillar, and are always
rendered:

| ID                | Role |
|-------------------|------|
| `harn-guide`    | How to work in a harnessed project: the reading order, which skill answers which situation, what to refuse, what to do at the end of a task. It lists, for each inactive pillar, the signs that the project now needs it, and has the agent propose `add <pillar>` to the human; it never adds one unasked. |
| `harn-upgrade` | Moves a project to a newer harness version: pin the package, preview `update`, resolve the conflicts it lists, apply, lint, then apply the migration notes of every version crossed. The notes are part of the skill: each minor release adds its entry, even "nothing to do". Command `/harn-upgrade`. |

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
  sections: the project map (where each active pillar lives), the
  doc-first rule, the checks (run `lint` before committing, never edit a
  generated file by hand) and a compact list of the rendered skills with
  their slash-commands when they exist. The map and the doc-first rule
  hold a line only for an active pillar: with `docs/intents/`, a visible
  change of behavior starts with `/harn-intent <verb + object>`, never with
  the code (§9.1.3). One line names the inactive pillars and how to add
  one, so the agent can propose it (§9.1.2). The engines discover skills
  natively.
- **`CLAUDE.md`** at the root if claude-code is included, reduced to
  the `@AGENTS.md` import.

## 9. Doc pillars — persistent contract

### 9.1 Layout

```
project/
├── README.md                         # README pillar (root, outside docs/)
└── docs/
    ├── spec/<subsystem>.md           # CORE: 1 file per major subsystem
    │                                 # every folder below is added on demand (§9.1.2)
    ├── decisions/
    │   ├── README.md                 # ADR index
    │   └── <slug>.md                 # no numbering (see §9.1.1)
    ├── handbook/<slug>.md            # no numbering (see §9.1.1)
    ├── tests/
    │   ├── integration-tests.md      # required once the pillar is active
    │   └── e2e-tests.md              # required once the pillar is active
    ├── workflow/
    │   └── coding-workflow.md        # required once the pillar is active
    ├── skills/<id>.skill.md          # see §9.1.2
    ├── quality/code-quality.md       # see §9.1.2
    ├── intents/                      # see §9.1.3
    │   ├── README.md                 # index, generated
    │   └── <slug>.md                 # one level-1 intent, no numbering
    └── profiles/                     # see §9.1.4
        ├── README.md                 # index, generated
        └── <slug>.md                 # one user profile, no numbering
```

- The `README` pillar lives at the root (universal convention of
  package registries); it is the only pillar outside `docs/`.
- The `tests/` pillar, once active, is constrained to two required
  files. Unit tests live next to the code and are not documented
  separately.
- The `workflow/` pillar, once active, has one required file. Further
  files (`release-workflow.md`, …) are an open question (§15.2).
- No other pillar (no separate `tutorials/` or `runbooks/`). A folder of
  `docs/` that is no pillar (`docs/research/`, …) is the project's: the
  harness reads it only to resolve a link.

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

### 9.1.2 Active pillars

README and spec are the **core**: always active, their skills always
rendered. A missing `README.md` is the only absence that fails the lint;
a project with no spec yet gets a warning. Every other pillar is
**active** when its folder under `docs/` exists and **inactive**
otherwise. Decision:
[pillars-on-demand](../decisions/pillars-on-demand.md).

| Pillar      | Folder            | Starter files written by `add`            | Skill it brings          |
|-------------|-------------------|--------------------------------------------|--------------------------|
| `decisions` | `docs/decisions/` | `README.md`, the index                     | `harn-decision-record-writer` |
| `handbook`  | `docs/handbook/`  | `README.md`, the index                     | `harn-handbook-writer`        |
| `tests`     | `docs/tests/`     | `integration-tests.md`, `e2e-tests.md`     | `harn-test-plan-writer`       |
| `workflow`  | `docs/workflow/`  | `coding-workflow.md`                       | `harn-workflow-writer`        |
| `quality`   | `docs/quality/`   | `code-quality.md`                          | —                        |
| `intents`   | `docs/intents/`   | — (the generated index)                    | `harn-intent-writer`          |
| `profiles`  | `docs/profiles/`  | — (the generated index)                    | `harn-intent-writer`          |
| `skills`    | `docs/skills/`    | not added: drop a `*.skill.md` file there  | —                        |

- **Inactive, a pillar leaves no trace**: none of its linters reports,
  its skill and command are not rendered, `AGENTS.md` holds no rule for
  it, and `harn-doc-audit` does not report it as a gap. Its absence is never
  an error.
- **Active, it commits to its form contract**: its linters apply and its
  required files must exist.
- **`vaubaan-harness add <pillar> [target-dir]`** activates a pillar: it
  creates the folder, writes the starter files from the templates
  without ever overwriting an existing file, then re-renders the
  installation as `update` does, which brings the pillar's skill, its
  command and its lines of `AGENTS.md`. A starter file holds
  placeholders: the lint fails on them until the pillar's writer skill
  has filled the file. Adding an active pillar changes nothing. Creating
  the folder by hand and running `update` is equivalent.
- **Removing** a pillar is deleting its folder, then `update`: the skill,
  the command and the generated index go with it.
- **A folder git cannot see is not a pillar.** A pillar folder that holds
  no file exists on one machine only; `lint:doc-layout` reports it.
- **A check between two pillars runs only while both are active.** An
  optional pillar never makes another one mandatory.
- **Who proposes.** `AGENTS.md` names the inactive pillars in one line;
  the `harn-guide` skill (§7.2) holds, for each, the signs that the
  project needs it. The agent proposes, the human decides, `add` does.

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
  skills. The pillar is active as soon as it holds a skill file; `add`
  does not apply to it.

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

When the pillar is active, `AGENTS.md` lists it in the project map and
every agent reads it before writing or auditing code. The file declares no
`tracks:`: like an ADR, it sets a norm and does not follow the code.

### 9.1.3 Intents

**`intents/`** — what the user does and wants, at every scale, from a
level-1 intent to the atomic activity a piece of code realizes: one tree
of intents, each heading an intent (verb + object, for an actor). Not a
sequence of steps: a node says what is wanted, not what comes next. The
pillar is where a new behavior is specified before it is coded, and the
backlog of what is decided and not delivered. Decision:
[intents-pillar](../decisions/intents-pillar.md). Inactive, nothing
changes; active, it commits to the form below.

The tree reads like an OKR tree kept in the repo: an intent is an
objective (qualitative, verb + object, for an actor), the `acceptance:`
lines of a terminal intent are its key results (observable, later
restated by test titles), its `anchors:` are the initiatives that
realize it, and the share of `implemented` terminal intents under a node
is the objective's progress, read from git instead of reported. Two
differences: an intent is binary (`proposed` or `implemented`), so a
numeric key result becomes an acceptance criterion and then a test, not
a metric tracked over time; and the tree is permanent, it says what the
product does, while a quarter is the subset of `proposed` intents the
team picks, which lives in its ticketing tool, not here.

**Layout.** One file `docs/intents/<slug>.md` per level-1 intent,
titled verb + object, never a category; slug without numbering (§9.1.1).
`docs/intents/README.md` is the index, generated (see *Index* below).

**File.** Strict frontmatter; an unknown field is an error:

- `title` (required) — verb + object.
- `status` (required) — `proposed | implemented | deprecated`; the
  default status of the file's nodes.
- `actors` (required) — the user roles, free but stable in the project;
  while the profiles pillar is active, each is a profile (§9.1.4).
- `spec` (required) — one relative path, or a list, to the specs whose
  vocabulary the file uses; each path must resolve.
- `last_reviewed` (required) — date; same semantics as a handbook.

The first paragraph after the title is the **intent statement** of the
level-1 intent: "As a <actor>, I want <intent> so that <outcome>."

**Nodes.** Every heading of level 2 and deeper is a node, and every node
is an intent (verb + object): the file is the level-1 intent, each
deeper heading a sub-intent. Its level is the heading depth minus one.
An intent with no deeper heading below it, before the next heading of
the same or a higher level, is a **terminal intent**; the others are
internal nodes. An internal node may carry one sentence, its intent statement;
a terminal intent carries no prose: its title and fields suffice, the
rule lives in the spec and the how in the handbook.

**Fields.** The lines directly under a heading, blank lines allowed,
one field per line, `key: value, value`. The block ends at the first
line that is neither a field, nor a list item of `acceptance:`, nor
blank. Fenced code is ignored.

| Field                    | On              | Rule                                                                                                                                                                  |
|--------------------------|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `status:`                | any node        | Overrides the file status for the node and its descendants. A `proposed` node in an `implemented` file is the increment in progress.                                 |
| `spec:`                  | any node        | Relative path, optional `#fragment`, to the spec section that holds the rule. The path must resolve.                                                                  |
| `anchors:`               | terminal intent | Paths or globs from the repo root, code and tests, the `tracks:` syntax. Required when the intent is `implemented`; each must match at least one existing file.       |
| `acceptance:`            | terminal intent | Followed by `- ` list items: observable criteria. Required when the intent is `proposed`. Removed at delivery: the titles of the anchored tests restate them.         |
| `relieves:` / `delivers:` | terminal intent, optional | Pains the activity relieves, gains it delivers: slugs of the profiles named by the file's `actors` (§9.1.4). An error while the profiles pillar is inactive. |
| `requires:` / `creates:` | terminal intent, optional | Entities (below) the activity needs from another activity, or produces. The edges of the intent graph. What comes from outside the project (an operator's input, an external system) is not declared: the intent is an entry point. |

Any other key directly under a heading is an error. A derivable fact
(`uses:`, `guards:`, depth, coverage) is never declared. A terminal
intent carries at least one field; a field of a terminal intent on an
internal node is an error.

**Entities.** An entity is the kebab-case slug (lowercase, runs of
non-alphanumeric characters replaced by one hyphen) of a bold term
opening a bullet, or of the first cell of a table row, in the Vocabulary
section of one of the intent file's specs: the section headed `Vocabulary` or `Vocabulaire`, optionally
numbered, up to the next heading of the same or a higher level.
`**Generated file**` gives `generated-file`. No plural, no synonym: a
missing word is added to the spec first. The language of the entities is
the language of the spec.

**Statuses.**

- `proposed` — decided, not delivered. Created by `/harn-intent <verb + object>`. Carries
  `acceptance:`, no `anchors:`. The `proposed` nodes are the backlog.
- `implemented` — delivered, anchors valid. The pull request that
  delivers adds `anchors:`, writes the tests whose titles restate the
  criteria, removes `acceptance:`.
- `deprecated` — withdrawn, kept one release so agents know the
  intent existed; anchors may disappear; deleted at the next release.
  No History section, as for an ADR.

A node never returns to `proposed`. A delivered intent changes only in the
pull request that delivers the change; between deliveries, a change of
behavior is a sibling `proposed` intent, merged into it at delivery. A
level-1 intent is `implemented` as soon as one of its terminal intents is.

**Index.** `docs/intents/README.md` is rendered by `init`, `update` and
`add` while the pillar is active: the whole tree as an indented
list, one line per node with its effective status, the actors on the
level-1 intent line, a link to each file; with no intent file yet, one
line says how to write the first. It is a generated file: recorded in the
manifest, committed, covered by `lint:generated-fresh`, removed with the
folder, never edited by hand. An intent file that does not parse
fails the render, like an invalid project skill.

**Umbrella.** When the pillar is active, `AGENTS.md` lists it
in the project map and the doc-first rule adds: a visible change of
behavior starts with `/harn-intent <verb + object>`, never with the code.

**Command.** One command, `/harn-intent [verb + object]`. With an argument it
proposes that intent as a `proposed` terminal intent with its acceptance
criteria, before any code. Without one it maps or extends the tree:
three questions on a greenfield scope, extraction from the code's entry
points on a mature one.

**Linters** (§10.2): `lint:intent-schema`, `lint:intent-anchors`,
`lint:intent-vocabulary`, `lint:intent-graph`, `lint:intent-profiles`; `lint:tracks-drift`
treats the union of an intent file's anchors as its tracked paths.
`lint:spec-tech-agnostic` does not apply to the pillar: anchors are code
paths by construction.

**Not in the pillar.** Size targets (2 to 9 children per node, 40 to
120 lines per file, split into two level-1 intents beyond) belong to
`harn-intent-writer` and `harn-doc-audit`, not to a linter. The harness reads no
source code: capability usage, role guards and unanchored entry points
are the `harn-drift-detector`'s judgment. Graph analytics (dominance,
quotient graphs, reports, viewers) are outside the harness; the format
is parsable by regex so an external tool can produce them.

### 9.1.4 Profiles

**`profiles/`** — who the project serves: one file per kind of user,
with what hurts them today and what they hope for, and the evidence
behind it. It gives the actors of the intents a definition, and each
intent a reason. A profile is a user, never an agent role. Decision:
[profiles-pillar](../decisions/profiles-pillar.md). Inactive, nothing
changes; active, it commits to the form below.

**Layout.** One file `docs/profiles/<slug>.md` per profile, slug without
numbering (§9.1.1). The slug is the profile's name wherever it is
referred to. `docs/profiles/README.md` is the index, generated.

**File.** Strict frontmatter; an unknown field is an error:

- `title` (required) — who they are, in a few words.
- `status` (required) — `hypothesis | validated`. A profile is a
  hypothesis until research backs it.
- `evidence` (required when `validated`) — one link or a list: a file of
  the repo, by relative path, which must resolve, or an address outside
  it. Research notes are the project's, in a folder or a tool of its
  choice: they are not a pillar and are never copied into the profile.
- `last_reviewed` (required) — date.

The first paragraph after the title says who the profile is and in what
situation. Then two sections, at least one of them non-empty:

- **Pains** — one bullet per pain, opening with its name in bold, then
  what hurts. The most severe first: the order is the rank.
- **Gains** — the same for the outcomes hoped for.

The slug of a pain or a gain is formed like an entity (§9.1.3): `**Context
rot**` gives `context-rot`. A slug is unique within a profile.

**No jobs section.** What a profile is trying to do is its intents: the
level-1 intents that name it in `actors:`. Written twice, they would
diverge.

**Link from the intents.** While the pillar is active:

- every actor of an intent file is the slug of a profile;
- a terminal intent may declare `relieves:` (pains) and `delivers:`
  (gains), each a slug of one of the profiles the file names as actors.

**Index.** `docs/profiles/README.md` is rendered while the pillar is
active: each profile with its status, the level-1 intents that name it,
and under each pain and gain the terminal intents that serve it, or the
mention that none does yet. This is the fit between what the users need
and what the product does, read from the repo. Generated like the
intents index (§9.1.3).

**Skill.** No dedicated one: `harn-intent-writer` writes a profile from the
research the human points to, and asks, for each new intent, which
profile and which pain or gain it serves.

**Linters** (§10.2): `lint:profile-schema`, `lint:intent-profiles`.

**Not in the pillar.** Whether a pain is worth relieving, whether a
profile is still true, whether an intent serves nobody: `harn-doc-audit`'s
judgment, never a gate. A known pain that nothing relieves is a product
choice, not an error. Ordered journeys across intents remain an open
question (§15.2).

### 9.2 Templates (shipped by the harness)

`@vaubaan/harness/templates/{readme,spec,decision,handbook,integration-tests,e2e-tests,coding-workflow,code-quality,intent,profile,decisions-index,handbook-index}.md.tmpl`.
The wizards (`harn-readme-writer`, `harn-spec-writer`, `harn-decision-record-writer`,
`harn-handbook-writer`, `harn-test-plan-writer`, `harn-workflow-writer`,
`harn-intent-writer`) instantiate these templates. Minimal format:

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
- **code-quality.md**: Mechanical checks +
  Project rules + Accepted deviations. No dedicated wizard in v1: the
  file is edited by hand from the template.
- **intent.md**: frontmatter + intent statement + nested
  nodes with their fields (§9.1.3); 40-120 lines.
- **profile.md**: frontmatter + who they are + Pains + Gains (§9.1.4);
  20-40 lines.
- **decisions-index.md** / **handbook-index.md**: the `README.md` that
  `add` writes into the pillar: what the folder holds and its list of
  files, kept by the pillar's writer.

### 9.3 Completeness criteria (audited by `harn-doc-audit`)

A criterion about a pillar applies only while that pillar is active
(§9.1.2); an inactive pillar is neither a gap nor a recommendation of
the report.

- **README presence**: `README.md` at the root **must** exist and
  contain at least the template sections (pitch + quick start +
  links). Gap → ❌.
- **README links**: the README must link to `docs/spec/` and to each
  active pillar among `docs/handbook/` and
  `docs/workflow/coding-workflow.md`. Otherwise → ⚠️.
- **Spec coverage**: every major subsystem has a spec. A subsystem is
  a package of a multi-package repo or a top-level route of an app,
  unless the project's `harn-doc-audit` override lists them.
- **Explicit decisions**: `harn-doc-audit` flags recent commits whose
  message carries decision hints ("decided to", "switched from X to
  Y", "removed X because") without a matching ADR.
- **Handbook freshness**: each handbook declares the code it depends on
  (`tracks: [...]`). A handbook older than its tracked files by more
  than a threshold (default N commits) → warning.
- **Tests presence**: if `docs/tests/` exists, the two required files
  (`integration-tests.md`, `e2e-tests.md`) **must** exist. Gap → ❌.
- **Tests coverage cross-check**: each spec is exercised by at
  least one integration or E2E test file, or listed under "Known
  gaps" in a test plan. Otherwise → ⚠️ "spec without tests".
- **Tests freshness**: same `tracks: [...]` criteria as the handbook —
  a test plan that refers to code that has disappeared = ❌.
- **Workflow presence**: if `docs/workflow/` exists,
  `coding-workflow.md` **must** exist and cover the 5 core topics (CI, env variants, PR process,
  branches, release). Gap → ❌.
- **Workflow freshness**: `coding-workflow.md` `tracks:` the CI/CD
  config files and the package manifest. Drift → ⚠️.
- **Quality**: if `docs/quality/` exists,
  `code-quality.md` **must** exist with its three required sections
  (§9.1.2). Gap → ❌. Content that copies an ADR, a handbook, a tool's
  configuration or generic principles → ⚠️ (pillar boundary).
- **Intents**: if `docs/intents/` exists: each
  spec is linked by at least one intent file, otherwise → ⚠️ "spec
  without intents"; each `implemented` terminal intent anchors at least one
  test; a `proposed` intent older than N commits → ⚠️ pending increment;
  the test titles of a delivered intent restate its former criteria
  (judgment).
- **Profiles**: if `docs/profiles/` exists: a `hypothesis` profile
  older than N commits → ⚠️ "unvalidated profile"; a first-ranked pain
  that no intent relieves → ⚠️ "unserved pain"; with intents, a
  `proposed` terminal intent that relieves no pain and delivers no gain
  → ⚠️ "intent without a reason"; a pain or gain worded as a feature
  ("no dashboard") rather than as what the user lives → ⚠️ (judgment).
- **Cross-link consistency**: among the active pillars, a spec has at
  least one decision, one handbook or a mention in the tests; a decision
  is referenced by at least one other doc. Otherwise → orphan.
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

- **§10.1 `harn-doc-audit` skill** — the judgment audit, executed by an
  agent (pillar boundaries, semantic freshness, implicit decisions).
  Output = Markdown report.
- **§10.2 Mechanical linters** — the exit-code version of the checks
  that can be mechanized. Run in CI, they **block the merge** if red.
- **§10.3 Division of labor** between the two.

### 10.1 `harn-doc-audit` skill

Reads `docs/` and the root README, parses each file's frontmatter, runs
the §9.3 checks. Output: a Markdown report under
`.vaubaan/reports/doc-audit.md` in the target directory (or at a path
passed as argument): one section per pillar with ✅ / ⚠️ / ❌ items, then
cross-links, pillar boundaries and recommendations.

Global verdict: `done` if zero `❌`, otherwise `needs-human`.

### 10.2 Mechanical linters (CI gates)

Each linter is a pure function `(repoRoot) → issues`, with no LLM and no
network. A linter of a pillar reports nothing while the pillar is
inactive (§9.1.2). `vaubaan-harness lint` runs them all with an aggregated exit
code: `0` if no issue of severity `error`, `1` otherwise. Options
filter by pillar or by linter id and choose a text or JSON output.

| Linter ID                       | Targeted pillar(s)       | Check                                                                                                                                                     | Severity      |
|---------------------------------|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| `lint:readme-presence`          | README                   | `README.md` exists at the root.                                                                                                                          | error         |
| `lint:readme-sections`          | README                   | `README.md` contains the template sections (regex on headers).                                                                                           | error         |
| `lint:doc-layout`               | all                      | No pillar folder is empty: git does not record an empty folder, so the pillar would be active on one machine only.                                       | error         |
| `lint:cardinal-files`           | tests, workflow          | If `docs/tests/` exists: `integration-tests.md` and `e2e-tests.md` exist. If `docs/workflow/` exists: `coding-workflow.md` exists.                        | error         |
| `lint:decision-schema`          | decisions                | Each ADR has the 4 sections Context + Decision + Consequences + Rejected alternatives (regex headers).                                                     | error         |
| `lint:adr-no-tracks`            | decisions                | No ADR declares a non-empty `tracks:` (an ADR states a decision, it does not follow the code).                                                          | error         |
| `lint:frontmatter-tracks`       | handbook, tests, workflow | Each file declares `tracks: [...]` in frontmatter and all tracked paths exist in the repo.                                                               | error         |
| `lint:tracks-drift`             | handbook, tests, workflow, intents | The doc file is older than its tracked files by more than N commits (configurable). For an intent file, the tracked paths are the union of its anchors.  | warning       |
| `lint:spec-tech-agnostic`       | spec                     | Blocklist of tech keywords (frameworks, runtimes, infra providers — effective list in the source code) **forbidden** in `spec/` files.                   | error         |
| `lint:spec-has-content`         | spec                     | `docs/spec/` contains at least one `.md` file: a project with no spec yet is warned, not failed.                                                         | warning       |
| `lint:cross-links`              | all                      | All relative Markdown links resolve to an existing file.                                                                                                 | error         |
| `lint:orphan-decisions`         | decisions                | Each ADR is referenced by at least one other doc file.                                                                                                   | warning       |
| `lint:gitignore-harness`        | repo root                | `.gitignore` excludes `.harness-overrides/` and `.vaubaan/`, and ignores none of the generated paths (`AGENTS.md`, `CLAUDE.md`, engine folders, manifest). | error         |
| `lint:quality-schema`           | quality                  | If `docs/quality/` exists: `code-quality.md` exists and contains the 3 required sections (regex headers). No effect if the directory is absent.           | error         |
| `lint:generated-fresh`          | repo root                | When a manifest exists: every generated file equals the current render for the recorded engines and overrides; none is missing or stale.                 | error         |
| `lint:intent-schema`            | intents                  | If `docs/intents/` exists: strict frontmatter; known node fields, the fields of a terminal intent on terminal intents only; an `implemented` terminal intent has `anchors:`, a `proposed` one has `acceptance:`; a terminal intent has at least one field; `spec` paths resolve. No effect if the directory is absent. | error |
| `lint:intent-anchors`           | intents                  | Every anchor matches at least one existing file (same resolution as `tracks:`), reported at the node's line.                                            | error         |
| `lint:intent-vocabulary`        | intents                  | Every entity of `requires:` / `creates:` is a term of the Vocabulary section of a linked spec. Downgraded to a warning when no linked spec has a Vocabulary section. | error |
| `lint:intent-graph`             | intents                  | An entity a terminal intent requires that no terminal intent of any file creates: the intent is unreachable in the doc.                              | warning       |
| `lint:intent-profiles`          | intents, profiles        | While both pillars are active: every actor of an intent file is a profile; every `relieves:` is a pain and every `delivers:` a gain of one of the file's actors. With intents alone: `relieves:` / `delivers:` are an error. | error |
| `lint:profile-schema`           | profiles                 | If `docs/profiles/` exists: strict frontmatter; a `validated` profile has `evidence:`; an evidence path of the repo resolves; at least one pain or gain; each one opens with a bold name, unique in the file. | error |

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

| Check                                                       | Mechanical linter | `harn-doc-audit` skill |
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

### 10.4 View and review

The meta database gets a view; Markdown stays the only source. Decision:
[context-view](../decisions/context-view.md).

- `vaubaan-harness view` builds the context graph with the parsers the
  linters use and attaches the lint report to it, then renders the
  view: one self-contained page that makes no network request, whose
  content is in the markup (scripts only for interaction), and whose
  bytes are identical for an identical tree. It is not a gate: it exits
  `0` and no linter reads it.
- Every node has a stable id, its domain (§0.2), its source file and
  line. A lint issue attaches to the deepest node of its file at or
  above its line, otherwise to the file node.
- The view lays the graph out on a canvas: a map with one card per
  document, grouped by pillar, where terms, code paths, alternatives
  and lint issues are counts on their document's card and only the
  links between documents are drawn. Selecting a card focuses on it:
  its neighbours of every kind gather around it, the rest fades. Other
  views answer one question each: the state of the context, the intent
  tree, the vocabulary, the decisions, the linters, the skills. Every
  card links to its source line.
- A **review session** (decision:
  [review-loop](../decisions/review-loop.md)) starts by copying `docs/`
  and `README.md` to `.vaubaan/review/snapshot/`, then serves the view
  on the local machine behind a random token. Each change of the docs
  rebuilds the graph and reaches the open view; it shows the docs
  before, now and the differences, with the lint delta.
- The human pins comments and hands a batch over to the agent; the
  agent reads it with `review next` and answers each thread with
  `review reply`. `review keep` ends the session with the changes left
  uncommitted; `review discard` restores `docs/` and `README.md` byte
  for byte, untracked files included. One live session per repo.
- The `harn-canvas-review` skill runs the loop. A comment on a project doc
  changes that doc; a comment on a linter or a shipped skill yields an
  upstream issue draft under `.vaubaan/reports/`; a comment on a
  generated file changes its source, then `update` runs.

### 10.5 Lessons from reviews

Reviews end in small patches; each recurring one is a rule written
nowhere. Decision:
[lessons-from-reviews](../decisions/lessons-from-reviews.md).

- `vaubaan-harness lessons collect` extracts patch events (source,
  date, files, a one-line quote) into `.vaubaan/lessons/`: from the repo
  history (fix-up commits, small commits that retouch a recent change
  with review wording), from pull request data the skill fetched, from
  the threads review sessions archived and, only for the sources the
  project enables in its lint configuration, from engine conversation
  histories. It calls no network service and its output is
  deterministic.
- The `harn-self-improve` skill groups the events by meaning and proposes a
  lesson for each group seen at least twice and covered by no rule in
  force; a rule in force that the patches show is not followed is
  reported as such. Each lesson names its evidence, its domain and the
  pillar it would go to, and appears in the view.
- Nothing is written without the human. An accepted lesson lands in a
  project pillar (quality, workflow, handbook, test plan, a project
  skill), which the human adds first when it is inactive (§9.1.2); a lesson valid for every project becomes an upstream issue
  draft. Rejected lessons are kept locally so they do not come back.

## 11. Gitignored overrides

A project can override the harness locally via `.harness-overrides/`
in its worktree. **Gitignored by design, never committed.** Typical
uses: iterating on a skill before proposing it upstream, temporary
debugging, disabling a shipped skill.

```
project/.harness-overrides/
├── skills/
│   ├── my-custom-skill.skill.md      # addition
│   └── harn-doc-audit.skill.md            # replaces the shipped version
├── commands/
└── disable.yaml                      # disable: [harn-drift-detector]
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

**Growing with the project**: `vaubaan-harness add <pillar>
[target-dir]` (§9.1.2) activates a pillar the day the project needs it.
It ends with the next step: the writer skill that fills the starter
files. Before any installation it only writes the starter files.

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
version, and does not touch the project's dependency on the package:
choosing the version, and whatever a version asks of the project beyond
a re-render, is the `harn-upgrade` skill's procedure (§7.2).
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

**Layout check**: `vaubaan-harness check <repo>` exits `0` if
`README.md` exists and `.gitignore` covers `.harness-overrides/` and
`.vaubaan/` without ignoring a generated file, `1` with a diagnostic
otherwise.

**View and review**: `vaubaan-harness view`, then
`vaubaan-harness review start | next | reply | status | keep | discard`
(§10.4). **Lessons**: `vaubaan-harness lessons collect` (§10.5).

**Lint**: `vaubaan-harness lint` (§10.2), wired into the project's CI
and pre-commit hook.

**Bootstrapping the doc of an existing project** is not a CLI: the
agent, following the doc-first rule of `AGENTS.md` and the
`harn-guide` skill, proposes the pillars the project is ready for,
finds the gaps of the active ones with `harn-doc-audit` and fills them with
the writer skills.

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
- **Integration**: `init`, `update`, `add`, `uninstall` and `check` on
  target directories in various states (empty, existing user files, edited
  generated files, old manifests, unsafe paths); each linter on a
  passing and a failing fixture, the intent linters included;
  `lint:generated-fresh` passing after `init` and failing after a hand
  edit; the intents index rendered, updated and removed with the
  intent files, and carried over from its 2.2 path; a project with a
  README alone passing the lint and receiving only the always-rendered
  skills; a pillar's skill, command and umbrella lines appearing with
  `add` and leaving with the folder; the profiles index and its fit;
  `harn-upgrade` holding an entry for the current version.
- **E2E**: the packed package installed and run as a user would, per
  engine; an override replacing a shipped skill in the render.
- **View and review**: the context graph on a fixture and on this
  repository, byte-identical across two runs; no lint result changes
  when the linters move to the shared parsers; a review session's
  discard restores modified, created, deleted and untracked docs.
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
- **OQ — Conversation histories of Codex and OpenCode.** Where each
  engine stores them, and whether their format is stable enough to
  collect lessons from (§10.5).
- **OQ — Ordered journeys.** The intents tree deliberately holds no
  sequence of steps (§9.1.3), and a profile lists pains and gains, not a
  path (§9.1.4). Should an ordered path across intents have a place?
- **OQ — Shrinking the test plans.** Once active, `tests/` asks for both
  files. Should a project with no end-to-end test be allowed one?
- **OQ — Per-project `harn-doc-audit` config.** Beyond the drift threshold,
  should more knobs be exposed (expected subsystem names, exclusions)?
