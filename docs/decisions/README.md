# Decisions (ADRs)

Architecture Decision Records for the `@vaubaan/harness` project. Each ADR
contains the 4 required sections (Context, Decision, Consequences,
Rejected alternatives) — validated by `lint:decision-schema`
(see [spec §10.2](../spec/coding-agent-harness.md)).

## Naming convention

**No numbering.** Each ADR is a `<slug>.md` file (kebab-case) — no numeric prefix. This is deliberate:

- **No implicit precedence logic** between ADRs. If order matters (rare), it is read from the frontmatter date or from an explicit field (`supersedes:` / `superseded_by:`), not from the file name.
- **Easy evolution**: adding, superseding, archiving without renumbering or breaking links.
- **The slug is the identity** — it survives mechanical renames.

## Format

- Frontmatter or free-form header, but the 4 required sections are
  mandatory with their exact English titles (`Context`, `Decision`,
  `Consequences`, `Rejected alternatives`). The linter still accepts the
  French titles for backward compatibility.
- Each ADR references at least one other ADR or the spec — an
  orphan ADR is flagged by `lint:orphan-decisions`.
- Status: `proposed` / `accepted` / `superseded`. A superseded ADR
  stays in the repo and points to its successor (`superseded_by: <slug>`).

## v1 index

- [No MCP rendering, no code-driven merge](./no-mcp-no-code-merge.md) — `--with-mcp` and the MCP files are gone; a shared file is written only when absent or still ours, never merged; hook files are ordinary generated files; files 1.x edited are released to the project (2.0.0).
- [`init` never overwrites what it does not own](./safe-init.md) — `init` shares the `update` planner: conflicts listed before any write, `--preserve`, transaction with backup; `uninstall` keeps edited files (1.4.0). Its entry-level merge was removed in 2.0.
- [One OpenCode Stop-hook plugin for V1 and V2](./opencode-v1-v2-stop-hook-plugin.md) — a single default export with `server()` (1.x) and `setup()` (2.x); verified against OpenCode 1.14.50 and 2.0.29 (1.3.2).
- [English as the canonical language](./english-canonical-language.md) — docs, rendered content and templates in English; linters take English ADR and quality headings and still accept the French ones (1.3.0).
- [Public release under `@vaubaan/harness`](./public-npmjs-vaubaan-scope.md) — public package on npmjs, GitHub Packages dropped, CLI and `.vaubaan/` unchanged, no migration of old hooks (1.3.0).
- [Optional pillar `docs/quality/`](./quality-optional-pillar.md) — a required file `code-quality.md` (mechanical checks, project rules, accepted deviations), read first by `clean-code-guardian` and checked by `lint:quality-schema` when it exists.
- [Removal of CAR couplings](./retire-coding-agent-runner-coupling.md) — `.car/` is no longer required, the CAR end-of-turn log is removed and the unimplemented supervisor plan is archived (1.1.1).
- [Migrating existing installations](./project-update-migrations.md) — `update` command, settings preserved, preview, private backup and rollback; file provenance in the v6 manifest (1.1.0).
- [Release of the 1.0.1 patch](./release-safety-patch-1-0-1.md) — PR #51, go basis and tag-based publication after CI validation.
- [Safe lifecycle for project artifacts](./safe-project-artifact-lifecycle.md) — upfront path validation and persona preservation during lint continuations (1.0.1). Its ownership of OpenCode MCP entries was removed in 2.0.
- [Multi-engine pivot format](./multi-engine-pivot-format.md) — a single `*.skill.md` / `*.cmd.md` / `*.agent.md` source rendered by 3 per-engine renderers.
- [TypeScript / Node stack](./typescript-node-stack.md) — strict TypeScript, Node ≥20, ESM, build via `tsup`.
- [YAML frontmatter + strict Zod](./yaml-frontmatter-zod-strict.md) — `.strict()` validation that rejects any unknown field, to avoid silent drift.
- [TOML for opencode](./toml-for-opencode.md) — *superseded by [engine-native-layouts-1-0](./engine-native-layouts-1-0.md)* (2026-09-20). The opencode renderer emits TOML (`+++`); claude-code and codex-cli stay on YAML (`---`).
- [Capabilities matrix + degradation](./capabilities-matrix-with-degradation.md) — two structures (`CAPABILITIES_MATRIX` + `DEGRADED_CAPABILITIES`) and three rendering policies (skip / degraded / full).
- [`CLAUDE.md` stub](./claude-md-stub-back-compat.md) — *superseded by [engine-native-layouts-1-0](./engine-native-layouts-1-0.md)* (2026-09-20). claude-code emits `AGENTS.md` + `CLAUDE.md` (redirect stub); the other two engines only emit `AGENTS.md`.
- [Mechanical linters vs `doc-audit` skill](./linters-mechanical-vs-skills.md) — 13 TypeScript linters for CI gates, an LLM-driven skill for semantic judgment.
- [Content under `src/`](./content-under-src.md) — Markdown sources (`agents/`, `skills/`, `commands/`, `templates/`) under `src/`, copied to `dist/` at build time.
- [MCP rendering opt-in](./mcp-rendering-opt-in.md) — *superseded by [no-mcp-no-code-merge](./no-mcp-no-code-merge.md)* (2026-10-22). Opt-in `--with-mcp=context7`; one MCP file rendered per engine in its native convention; `coding` + `planning` personas redirected to `resolve-library-id` + `get-library-docs`.
- [Self-healing `/harness-lint` loop via cross-engine Stop hooks](./stop-hook-lint-loop.md) — in-session Stop hook that injects `/harness-lint` at the end of every dirty agent turn; 3 portable anti-loop layers; hook schemas documented but not smoke-tested against the live CLIs (accepted area of uncertainty).
- [Supervisor support design in the harness](./supervisor-harness-design.md) — historical proposal withdrawn on 2026-09-20 after CAR was abandoned; schemas, linters and `./supervisor` export proposed but never implemented.
- [GitHub Actions CI on PRs and `main`](./github-actions-ci.md) — `ci.yml` workflow running `npm run ci` on every PR and push to `main`; a technical gate replacing human discipline; aligned with the in-session Stop hook.
- [Multi-agent and multi-engine by default](./multi-agent-multi-engine-default.md) — all agents rendered side by side at init, all engines enabled by default.
- [Stack-aware render + lint](./stack-aware-render-and-lint.md) — *superseded by [stop-hook-lint-loop](./stop-hook-lint-loop.md)* (2026-06-01).
- [Merge PR#1 — formatReportText tests](./test-format-report-text-merge.md) — validation of the squash merge of PR#1 adding 10 unit tests for formatReportText.
- [Verified native layouts per engine (1.0.0)](./engine-native-layouts-1-0.md) — each renderer emits exactly what its engine's docs say it reads (Codex skills under `.agents/skills/`, Codex agents in TOML, OpenCode in YAML); `CLAUDE.md` becomes the `@AGENTS.md` import; personas without duplicated lists.
