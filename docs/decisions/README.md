# Decisions

Architecture decisions of the `@vaubaan/harness` project. Each file
contains the 4 required sections (Context, Decision, Consequences,
Rejected alternatives), validated by `lint:decision-schema`
(see [spec §10.2](../spec/coding-agent-harness.md)).

## Convention

**A decision file is a current state**
([decisions-as-current-state](./decisions-as-current-state.md)):

- One file per topic, `<slug>.md` in kebab-case, no numbering. The slug
  is the identity.
- The four sections describe the position in force. When the position
  changes, the file is rewritten.
- A `## History` section lists the reversals, one line each: date,
  commit when known, one sentence. Anything longer is in git.
- A superseded file is deleted; its one-line summary moves into the
  History of its successor, and links are repointed.
- Each decision references at least one other decision or the spec; an
  orphan is flagged by `lint:orphan-decisions`. No decision carries
  `tracks:` (`lint:adr-no-tracks`).
- The French section titles are still accepted by the linter.

## Decisions in force

- [A decision file is a current state](./decisions-as-current-state.md) — one file per topic, rewritten on reversal, a History line per change; superseded files deleted (2.0.0).
- [No agent personas, no code-quality judgment](./no-personas-no-code-judgment.md) — the four personas, the `*.agent.md` pivot and `clean-code-guardian` are removed; one working rule in `AGENTS.md`, the team's workflow in `docs/workflow/`, its own personas in `docs/skills/` (2.0.0).
- [The engine choice is mandatory](./engine-choice-mandatory.md) — `--engines` required on `init` and `render`, no default to all three; `update` keeps the manifest's engines (2.0.0).
- [Generated files are committed](./generated-files-committed.md) — `AGENTS.md`, the engine folders and the manifest are versioned; `lint:generated-fresh` fails on a stale or edited copy; `lint:gitignore-harness` requires only `.harness-overrides/` and `.vaubaan/` and forbids ignoring generated paths (2.0.0).
- [Lint in CI and pre-commit, no Stop hook](./lint-in-ci-and-pre-commit.md) — no engine hook; lint runs in CI, in a git pre-commit hook and on demand; `stop-hook` stays a hidden no-op until 3.0 (2.0.0).
- [No MCP rendering, no code-driven merge](./no-mcp-no-code-merge.md) — `--with-mcp` and the MCP files are gone; the harness never merges a file it did not write; files 1.x edited are released to the project (2.0.0).
- [`init` never overwrites what it does not own](./safe-init.md) — `init` shares the `update` planner: conflicts listed before any write, `--preserve`, transaction with backup; `uninstall` keeps edited files (1.4.0).
- [English as the canonical language](./english-canonical-language.md) — docs, rendered content and templates in English; linters take English ADR and quality headings and still accept the French ones (1.3.0).
- [Public release under `@vaubaan/harness`](./public-npmjs-vaubaan-scope.md) — public package on npmjs, GitHub Packages dropped, CLI and `.vaubaan/` unchanged (1.3.0).
- [Optional pillar `docs/quality/`](./quality-optional-pillar.md) — a required file `code-quality.md` (mechanical checks, project rules, accepted deviations), checked by `lint:quality-schema` when it exists, read directly by agents.
- [The harness is standalone](./retire-coding-agent-runner-coupling.md) — no runtime coupling, no `.car/`, no end-of-turn signal, no supervisor (1.1.1).
- [Updating a project](./project-update-migrations.md) — `update` command, engines and overrides kept, preview, private backup and rollback, fingerprints in the v6 manifest, released paths (1.1.0).
- [Every path is validated before mutation](./safe-project-artifact-lifecycle.md) — relative, contained, non-symbolic paths checked for the whole batch before the first write or delete (1.0.1).
- [Each renderer emits exactly what its engine reads](./engine-native-layouts-1-0.md) — Codex skills under `.agents/skills/`, OpenCode in YAML, no Codex commands, `CLAUDE.md` as the `@AGENTS.md` import (1.0.0).
- [Project skills as optional seventh pillar](./project-skills-seventh-pillar.md) — `docs/skills/*.skill.md` rendered alongside the built-in skills; merge order stock, project, overrides.
- [GitHub Actions CI on PRs and `main`](./github-actions-ci.md) — `ci.yml` runs `npm run ci` on every PR and push to `main`; the only mechanical gate, with the husky pre-commit as a local convenience.
- [Multi-engine pivot format](./multi-engine-pivot-format.md) — a single `*.skill.md` / `*.cmd.md` source rendered by 3 per-engine renderers.
- [TypeScript / Node stack](./typescript-node-stack.md) — strict TypeScript, Node ≥20, ESM, build via `tsup`.
- [YAML frontmatter + strict Zod](./yaml-frontmatter-zod-strict.md) — `.strict()` validation that rejects any unknown field, to avoid silent drift.
- [Capabilities matrix + degradation](./capabilities-matrix-with-degradation.md) — `CAPABILITIES_MATRIX` + `DEGRADED_CAPABILITIES` and three rendering policies (skip / degraded / full).
- [Mechanical linters and the `doc-audit` skill](./linters-mechanical-vs-skills.md) — TypeScript linters as CI gates (15 in 2.0), an LLM-driven skill for semantic judgment.
- [Content under `src/`](./content-under-src.md) — Markdown sources (`skills/`, `commands/`, `templates/`) under `src/`, copied to `dist/` at build time.
