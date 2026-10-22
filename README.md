# @vaubaan/harness

**Project context as code.**

A context database for your project, kept in the repo. A few Markdown files hold what the code cannot say and point to the code and configs for everything else. Rendered into the native layout of Claude Code, Codex or OpenCode, and linted in CI so context and code never drift apart.

[![npm](https://img.shields.io/npm/v/@vaubaan/harness)](https://www.npmjs.com/package/@vaubaan/harness)
[![CI](https://github.com/vaubaan/harness/actions/workflows/ci.yml/badge.svg)](https://github.com/vaubaan/harness/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

```bash
npx -y @vaubaan/harness init . --engines=claude-code
```

---

## The problem

A coding agent is fast and knows nothing about your project. So you repeat the same instructions in every session. You maintain a `CLAUDE.md`, an `AGENTS.md` and an OpenCode config that slowly disagree. The agent changes a behavior, the doc still describes the old one, and nobody notices until a teammate ships against the wrong assumption.

The context of a project is real information: what you want, why it is built this way, how it actually works today, what "done" means, how you ship. It deserves a home, a shape, and a check.

## What the harness does

It does one thing. It keeps your project's context in a small, fixed set of Markdown files, gives every agent the same entry point into it, and refuses to let it go stale.

Think of it as a **context database with pointers**. Each pillar stores one kind of information the code cannot carry, and links to the code or config that carries the rest. Nothing is written twice: if a paragraph could be deleted without losing anything that is not in the files it points to, it does not belong in the doc.

| Pillar | What the doc says (the code cannot) | What it points to in the repo |
|---|---|---|
| `README.md` | What this is, how to run it. | `package.json` scripts, the quick start. |
| `docs/spec/` | What we want, for whom, what we refuse to do. Vocabulary. Tech-agnostic. | The modules and entry points that realize each requirement. A requirement with no pointer is a todo or dead. |
| `docs/decisions/` | Why it is built this way, what was rejected, what changed since. | The config files and commits that embody the decision: `tsconfig.json`, `ci.yml`, a sha. |
| `docs/handbook/` | The map: where to look, the invariants the code assumes, the gotchas. | The files it describes, declared in `tracks:`. A map, not a retelling. |
| `docs/tests/` | Which scenarios matter, what "done" means. | The test that implements each scenario. A scenario with no test is an acceptance criterion still open. |
| `docs/workflow/` | What lives outside the repo: approvals, protections, secrets, languages. | `ci.yml`, build scripts, pre-commit hook. |
| `docs/quality/` | Optional. The code rules this team holds, and the deviations it accepts. | The linter and formatter configs that enforce the mechanical part. |
| `docs/skills/` | Optional. Domain know-how the agent should load. | Whatever the skill needs. |

**One rule.** The only working rule the harness imposes, written into `AGENTS.md` for every engine: **understand the context, fill the gaps, code, update the context, commit.** How your team organizes itself around that, branches, review, release, is yours. You write it in `docs/workflow/` and the agents follow it. The harness ships no roles, no personas, no phases.

**Pointers stay true.** Handbooks and test plans declare the files they describe in a `tracks:` field. When that code moves and the doc does not, the linter says so. Decisions are current state, rewritten when you change your mind, with a one-line history per reversal; git holds the rest.

**Skills, in your engine's format.** Eight skills, one per pillar plus an audit and a drift detector, each with a slash command. They are written once and rendered where each engine looks for them.

**Checks, with zero tokens.** Fifteen mechanical linters run in CI and in your pre-commit hook. No engine hook, no injected turn, no loop. The agent sees a failed command and fixes it.

## What it looks like

A harnessed project, here a small invoicing service. Everything under `docs/` is yours and committed; the rest is rendered by the harness and committed too.

```
acme-billing/
├── README.md
├── AGENTS.md                      # rendered: the one rule, the map, the checks
├── CLAUDE.md                      # rendered: @AGENTS.md
├── .claude/  .agents/  .opencode/ # rendered: skills and commands per engine
├── .harness-manifest.json         # rendered: what the harness owns
└── docs/
    ├── spec/invoicing.md
    ├── decisions/postgres-over-sqlite.md
    ├── handbook/invoice-pipeline.md
    ├── tests/integration-tests.md
    ├── tests/e2e-tests.md
    ├── workflow/coding-workflow.md
    ├── quality/code-quality.md    # optional
    └── skills/tax-rules.skill.md  # optional
```

Each file says what the code cannot, and points to the code for the rest.

**`docs/spec/invoicing.md`**: intent and vocabulary, no technology, each requirement realized by something.

```markdown
---
status: draft
---
# Invoicing — spec

## 0. Vocabulary
- **Invoice**: a frozen statement of amounts due, never edited after issue.
- **Draft**: an invoice before issue; the only editable state.

## 1. Vision
1. A draft becomes an invoice in one irreversible step. → `src/invoicing/issue.ts`
2. An issued invoice can be voided, never deleted. → `src/invoicing/void.ts`

## 2. Out of scope
- Payment collection. Another subsystem.

## N. Open questions
- Multi-currency: not before a customer asks.
```

**`docs/decisions/postgres-over-sqlite.md`**: the why, the rejected options, the history. Current state, not a diary.

```markdown
# Postgres over SQLite for the invoice store

## Context
Invoices must survive concurrent issue from two workers.

## Decision
One Postgres database. Embodied by `docker-compose.yml` (service `db`)
and `src/db/client.ts`. Introduced in commit `4f1c2ab`.

## Consequences
Local setup needs Docker. Migrations live in `db/migrations/`.

## Rejected alternatives
| SQLite | single-writer lock under two workers |

## History
- 2026-03-02 `9a0b7e1`: started on SQLite for speed of setup.
- 2026-06-14 `4f1c2ab`: moved to Postgres after the first lost write.
```

**`docs/handbook/invoice-pipeline.md`**: the map, declared with `tracks:` so the linter notices when the code moves.

```markdown
---
tracks:
  - src/invoicing/**/*.ts
  - db/migrations/*.sql
last_reviewed: 2026-10-22
---
# Invoice pipeline

Entry point: `src/invoicing/issue.ts#issueInvoice`. It freezes the
draft, writes the row, emits `invoice.issued`.

Invariant the code assumes: a draft is only ever edited by its owner;
enforced in `src/invoicing/guards.ts#assertOwner`, not in the database.

Gotcha: `void.ts` keeps the row and flips `status`; reports must filter
on it (`src/reports/monthly.ts`).
```

**`docs/tests/integration-tests.md`**: which scenarios matter, and the test that holds each one.

```markdown
---
tracks: [tests/integration/**/*.test.ts]
---
| Scenario | Test |
|---|---|
| Issuing a draft twice fails the second time | `tests/integration/issue.test.ts` › "is irreversible" |
| Voiding keeps the invoice visible in reports | `tests/integration/void.test.ts` › "stays in monthly report" |
| Two workers issue the same draft | *open*: no test yet |
```

**`docs/workflow/coding-workflow.md`**: what lives outside the repo, and pointers to what lives in it.

```markdown
---
tracks: [.github/workflows/*.yml, package.json, .husky/pre-commit]
---
## CI pipeline
`ci.yml`: typecheck, test, `vaubaan-harness lint`. Required to merge.
## PR process
Trunk-based, squash merge, one approval; branch protection set in GitHub.
## Release
Tag `v*` triggers `publish.yml`. Secrets live in the GitHub environment `prod`.
## Languages
Docs and code in English. Domain vocabulary in spec §0, French-speaking team.
```

**`docs/quality/code-quality.md`** (optional): the rules a tool cannot check, and the deviations you accept.

```markdown
## Mechanical checks
biome (`biome.json`), tsc strict (`tsconfig.json`).
## Project rules
No business logic in route handlers; it lives in `src/invoicing/`.
## Accepted deviations
`any` allowed in `src/legacy/csv-import.ts` until it is rewritten.
```

**`docs/skills/tax-rules.skill.md`** (optional): know-how the agent loads, rendered like the built-in skills.

```markdown
---
id: tax-rules
description: How VAT rates are chosen and where they live.
---
Rates are in `config/vat.json`, keyed by country. Never hardcode a rate;
add a key and a fixture in `tests/fixtures/vat/`.
```

## Quick start

Requires Node.js 20 or later. Pick the engines you actually use.

```bash
npx -y @vaubaan/harness init . --engines=claude-code
# or: --engines=claude-code,codex-cli,opencode
```

This writes, for each engine:

```
AGENTS.md                 # how to work in this project (all engines)
CLAUDE.md                 # imports AGENTS.md (Claude Code)
.claude/                  # skills, commands (Claude Code)
.agents/skills/           # skills (Codex)
.opencode/                # skills, commands (OpenCode)
.harness-manifest.json    # what was written, for update/uninstall
```

**Commit all of it.** Generated files are part of the repo, so a fresh clone has the whole context without installing anything. The linter checks they still match the render. Only two paths are gitignored:

```gitignore
.harness-overrides/   # your local, disposable overrides
.vaubaan/             # skill reports
```

Then wire the linter where it blocks:

```bash
npm i -D @vaubaan/harness
npx husky init && echo "npx vaubaan-harness lint" > .husky/pre-commit
```

```yaml
# .github/workflows/docs.yml
name: docs
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npx vaubaan-harness lint
```

Finally, open your agent and let it fill the gaps:

```
/doc-audit      # what is missing or stale
/spec           # write the spec of a subsystem, guided
/decision       # turn an implicit choice into an ADR
```

> [!NOTE]
> `init` never overwrites a file it did not write. A hand-written `AGENTS.md` or `CLAUDE.md` stops it with a list: move the content into `docs/`, or keep the file as yours with `--preserve AGENTS.md`. It never merges a configuration file either, and it never touches `.claude/settings.json`, `.codex/hooks.json` or any MCP configuration.

## How it works

```
  docs/                            your context, versioned, reviewed in PRs
    │                              spec · decisions · handbook · tests · workflow · quality · skills
    │
    ▼  init / update
  AGENTS.md  .claude/  .codex/  .opencode/     rendered for your engines, committed
    │
    ▼
  Claude Code · Codex · OpenCode               read the same context, write the code
    │
    ▼  pre-commit, CI
  vaubaan-harness lint                         15 linters: shape, links, drift, freshness
```

1. **Your docs are the context.** A small, fixed layout under `docs/`. Every file has a template and a writer skill, so you rarely start from a blank page.
2. **The harness renders one pivot format into each engine's layout.** Skills and commands land where Claude Code, Codex and OpenCode look for them. `AGENTS.md` is the shared entry point; `CLAUDE.md` just imports it.
3. **Linters keep context and code in sync.** They run before each commit and on every pull request. The semantic part, contradictions, stale prose, missing pieces, is a skill the agent runs: `/doc-audit`.

## What's included

**8 skills**, each with a slash command. A skill never says *when* to do something. It says *how* to write or check one pillar.

| Command | Skill | What it does |
|---|---|---|
| `/doc-audit` | `doc-audit` | Audits completeness and freshness of every pillar. |
| `/drift` | `drift-detector` | Finds where docs no longer match the code. |
| `/spec` | `spec-writer` | Writes a tech-agnostic spec, progressively: three questions to start, one section at a time after. |
| `/decision` | `decision-record-writer` | Writes an ADR, spotting implicit decisions in your diff. |
| `/handbook` | `handbook-writer` | Documents how a feature is actually implemented. |
| `/test-plan` | `test-plan-writer` | Keeps integration and e2e test plans up to date. |
| `/workflow` | `workflow-writer` | Documents CI, environments, PR process, branches, release, languages. |
| `/readme` | `readme-writer` | Keeps the README in sync with the code. |

**15 linters**, fast enough to run on every commit.

<details>
<summary>See the list</summary>

| Linter | Checks |
|---|---|
| `readme-presence`, `readme-sections` | `README.md` exists and has a title and a quick start. |
| `doc-layout`, `cardinal-files` | The `docs/` folders and required files exist. |
| `spec-has-content`, `spec-tech-agnostic` | Specs exist and don't name frameworks or vendors. |
| `decision-schema` | Each ADR has its four sections. |
| `adr-no-tracks`, `orphan-decisions` | ADRs carry no `tracks:` and are referenced somewhere. |
| `frontmatter-tracks`, `tracks-drift` | Tracked paths exist; docs aren't older than the code they track. |
| `cross-links` | Links between docs resolve. |
| `gitignore-harness` | Overrides and reports are ignored; generated files are not. |
| `generated-fresh` | Committed generated files match the current render. |
| `quality-schema` | `docs/quality/code-quality.md` has its sections, if you use it. |

</details>

## Engine support

| | Claude Code | Codex | OpenCode |
|---|---|---|---|
| Entry point | `CLAUDE.md` → `AGENTS.md` | `AGENTS.md` | `AGENTS.md` |
| Skills | `.claude/skills/` | `.agents/skills/` | reuses the above |
| Slash commands | ✓ | invoke skills by name | ✓ |

You name your engines; nothing is rendered for a tool you don't use. Add one later with `init . --engines=...` again.

## Adopting it on an existing project

You don't have to write all the docs on day one.

- **See where you stand:** `npx @vaubaan/harness lint` lists what's missing, with the skill that fixes each item.
- **Let the agent do the first pass:** `/doc-audit`, then `/spec`, `/handbook` and `/decision` on the parts you touch. `/spec` starts with three questions; the rest fills in over time.
- **Keep what you had:** your own skills, settings and hooks are never touched. A hand-written `AGENTS.md` is listed, not overwritten.
- **Back out anytime:** `npx @vaubaan/harness uninstall .` removes what `init` wrote. Your own files are left in place.

## Commands

| Command | What it does |
|---|---|
| `init <dir> --engines=<list>` | Render the harness into a project. Re-run it to change engines. |
| `update [dir]` | Re-render with the installed version, keeping your engines. `--dry-run --json` previews. |
| `uninstall <dir>` | Remove what `init` wrote, leaving your own files in place. |
| `lint` | Run the linters. `--format json`, `--pillar <name>`, `--only <ids>`. |
| `check <dir>` | Quick layout check: doc folders and `.gitignore`. |
| `render --engines=<list> --out <dir>` | Preview the render somewhere harmless. |

Run them with `npx @vaubaan/harness <command>`. Install the package in the project (`npm i -D @vaubaan/harness`) so CI, pre-commit and your teammates render with the same version.

## Configuration

<details>
<summary><b>Ignore paths in lint</b></summary>

`node_modules/` and `dist/` are ignored by default. Add more in `.harnessrc.json` (or `.harnessrc`, `.harnessrc.yaml`, `harness.config.js`, or a `"harness"` key in `package.json`):

```json
{
  "lint": {
    "ignore": ["vendor/**", "packages/legacy/**"]
  }
}
```

Patterns use [fast-glob](https://github.com/mrmlnc/fast-glob#pattern-syntax) syntax and add to the defaults.

</details>

<details>
<summary><b>Local overrides</b></summary>

Try a custom skill or command without forking, in a gitignored `.harness-overrides/` folder:

```
.harness-overrides/
  skills/      *.skill.md
  commands/    *.cmd.md
  disable.yaml           # disable: [readme-writer, workflow-writer]
```

Overrides are personal and disposable. Skills meant for the whole team go in `docs/skills/`, which is versioned. See [overrides loading](./docs/handbook/overrides-loading.md).

</details>

<details>
<summary><b>Updating</b></summary>

```bash
npm i -D @vaubaan/harness@latest
npx @vaubaan/harness update . --dry-run --json   # preview
npx @vaubaan/harness update .                    # then commit the result
```

`update` keeps your engines and overrides. A generated file you edited by hand is reported instead of overwritten: move the change to `.harness-overrides/` or `docs/skills/`, or keep the file as yours with `--preserve <path>`. A backup is written outside the project before any change. Details: [updating a project](./docs/handbook/project-update.md).

</details>

## FAQ

**Does it phone home?** No. No telemetry, no daemon, no hook in your engine. It writes files and runs linters locally.

**Why commit the generated files?** So a clone has the whole context without installing the harness, and so the context survives a teammate who has never heard of it. `lint` fails when a committed file no longer matches the render, which is how it stays honest.

**Why no agents or personas?** Because how a team works is the team's decision. The harness imposes one rule, doc-first, and asks you to write the rest in `docs/workflow/`. A persona you like belongs in `docs/skills/`, versioned with your project.

**Why no engine hook?** A hook that re-injects a report at the end of every turn costs tokens you don't see, and every engine does it differently. A pre-commit hook and CI cost nothing and work the same everywhere.

**Can I write my docs in another language?** Prose, yes. The linters look for English section headings (`## Context`, `## Decision`…); French headings are also accepted. `/workflow` records which languages you use for docs, code and domain.

**Does it work in a monorepo?** Run it at the repository root and use `lint.ignore` for sub-projects you don't want checked.

**Coming from 1.x?** `--with-mcp`, the Stop hook and the four personas are gone. Run `update .`, remove the old Stop hook entry from your engine settings if you had one, un-ignore the generated files, and commit. The [changelog](./CHANGELOG.md) has the full list.

**Is this tied to Vaubaan?** No. Vaubaan builds it and uses it on its own projects, including this one, which is harnessed by itself.

## Where this is going

Decided, not shipped yet: typed context transactions (`/story`, `/decide`, `/refactor`, `/fix`), an optional `docs/todo/` pillar for increments that fold into the spec when delivered, pointer checks per section, a token budget per file, and `/compact` to rewrite a context that has grown contradictions. The [spec](./docs/spec/coding-agent-harness.md) and the [decisions](./docs/decisions/) say what exists today.

## Documentation

- [Spec](./docs/spec/coding-agent-harness.md), what the harness is and why
- [Decisions](./docs/decisions/), architecture choices and their alternatives
- [Handbook](./docs/handbook/), how each part works today
- [Test plans](./docs/tests/) and [workflow](./docs/workflow/coding-workflow.md)
- [Changelog](./CHANGELOG.md)

## Contributing

Issues and pull requests are welcome. Setup, conventions and the doc-first workflow are in [CONTRIBUTING.md](./CONTRIBUTING.md); security reports go through [SECURITY.md](./SECURITY.md).

```bash
git clone https://github.com/vaubaan/harness.git && cd harness
npm ci && npm run ci
```

## License

[Apache 2.0](./LICENSE), see [NOTICE](./NOTICE).
