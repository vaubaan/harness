# Changelog

All notable changes to `@vaubaan/harness` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Next release: **2.0.0**, breaking. The harness narrows to one job: keep a project's context in `docs/`, render it for the engines the project uses, lint it in CI. Decisions of 2026-10-22: [no MCP, no code merge](docs/decisions/no-mcp-no-code-merge.md), [lint in CI and pre-commit](docs/decisions/lint-in-ci-and-pre-commit.md), [generated files committed](docs/decisions/generated-files-committed.md), [engine choice mandatory](docs/decisions/engine-choice-mandatory.md), [no personas, no code judgment](docs/decisions/no-personas-no-code-judgment.md).

### Removed
- The four agent personas (`coding`, `review`, `merge`, `planning`), the `*.agent.md` pivot format and the `.<engine>/agents/` output. The harness imposes one working rule, doc-first, and asks the team to write its workflow in `docs/workflow/`.
- The Stop hook: no `.claude/settings.json`, `.codex/hooks.json` or OpenCode plugin is written; `src/stop-hook/` and the `.harness/` state are gone. `lint` runs in CI, in the project's pre-commit hook and on demand. The `stop-hook` command stays as a hidden no-op until 3.0 so a 1.x hook entry does not fail every turn.
- `clean-code-guardian` and `/clean-code`. The optional `docs/quality/` pillar stays and is read directly by agents.
- MCP rendering: `--with-mcp`, the context7 registry and the `.mcp.json`, `.codex/config.toml`, `.opencode/opencode.json` outputs.
- Code-driven merge of shared configuration files and the entry ownership it recorded (`hookConfigs`, `opencodeConfig`, `mcpConfig`, `stopHookInstalled`, `stopHookEngines`).
- `--no-stop-hook`, and the default "all engines" when `--engines` is omitted.

### Added
- `lint --only <ids>` runs a subset of linters; the `drift-detector` skill uses it as a pre-flight.
- `update` prunes the directories its removals leave empty, like `init`.
- `lint:generated-fresh`: renders with the manifest's engines and overrides and fails when a committed generated file differs, is missing or is stale.
- A `## Checks` section in `AGENTS.md`: run `lint` before committing; generated files are committed and never edited by hand.
- `coding-workflow.md` template: optional `## Languages` section (docs, code, domain), asked by `/workflow`.
- `/spec` is progressive: three questions on a greenfield subsystem, extraction from the code on a mature one, one section at a time after.

### Changed
- Generated files (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `.agents/`, `.opencode/`, `.harness-manifest.json`) are committed. `lint:gitignore-harness` and `check` now require only `.harness-overrides/` and `.vaubaan/` to be ignored, and fail when a generated path is ignored.
- `--engines` is required on `init` and `render`. `update` keeps the manifest's engines.
- `init` and `update` leave `.claude/settings.json`, `.codex/hooks.json` and every MCP file untouched; a manifest that still lists one drops it with a warning. When a settings file still contains the 1.x Stop hook command, `init` and `update` ask you to remove the entry.
- Linters: 15. Skills: 8. Commands: 8.

### Migration
1. `npm i -D @vaubaan/harness@2` then `npx vaubaan-harness update .`: stale agent files and the OpenCode plugin are removed, released files are left in place.
2. Remove the `npx -y @vaubaan/harness stop-hook` entry from `.claude/settings.json` or `.codex/hooks.json` if you had one.
3. Remove `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `.agents/`, `.opencode/`, `.harness-manifest.json`, `.harness/` and `.mcp.json` from `.gitignore`; keep `.harness-overrides/` and `.vaubaan/`. Commit the generated files.
4. Run `npx vaubaan-harness lint` in CI and add it to your pre-commit hook.
5. If you used `--with-mcp=context7`, the entry 1.x added to your engine configuration is now yours; keep or delete it.

## [1.4.0] — 2026-10-14

### Changed
- `init` never overwrites or deletes a file it does not own. It now shares the `update` planner: existing generated files outside the manifest, or edited since, stop the run before any write and are all listed; shared configurations are merged entry by entry; changes go through one transaction with a backup. See [the decision](docs/decisions/safe-init.md).
- `init` accepts `--preserve <paths>` and `--backup-dir <dir>`, and loads a `.harness-overrides/` folder in the project by default, like `update`.
- `--with-mcp` adds its servers to an existing `.mcp.json` and records only those entries (`mcpConfig` in the manifest). An existing `.codex/config.toml` is left untouched; `init` prints the block to add.
- `uninstall` keeps a generated file edited since the harness wrote it, with a warning.

### Fixed
- `init` replaced an existing `.claude/settings.json`, `.codex/hooks.json`, `.mcp.json` or `.codex/config.toml`, and `uninstall` then deleted it.
- `init` after `update` dropped preserved files, user hooks and their ownership.
- `init` → `update` → `uninstall` left `{"hooks":{"Stop":[]}}` files behind.
- `--engines` with duplicates rendered files twice; `--engines=` with no value meant all engines and is now refused.

### Migration
None required. Existing installations are read as before; hook files and `.mcp.json` that an earlier `init` recorded as whole files are converted to entry ownership on the next `init` or `update`.

## [1.3.2] — 2026-10-14

### Fixed
- OpenCode 2.x: the Stop hook plugin failed to load ("Plugin must export a default definition"). The rendered `.opencode/plugins/harness-stop-hook.ts` now has one default export with `server()` for OpenCode 1.x and `setup()` for 2.x. See [the decision](docs/decisions/opencode-v1-v2-stop-hook-plugin.md).
- `lint:gitignore-harness` and `check` now require `.harness/`, where the Stop hook keeps its state; an unignored state file kept the worktree dirty. `check` also requires `.mcp.json`, like the linter.
- `package.json`: the `bin` path no longer starts with `./`. npm 11 drops such a `bin` entry at publish time, which would have shipped a package without its CLI.
- README: the `.gitignore` snippet now passes `check` and `lint` (it missed `.vaubaan/` and `.mcp.json`, and an inline comment made the `.harness/` line ineffective).

### Changed
- `init` reminds you that Codex runs the Stop hook only after the project is trusted and the hook approved (`/hooks`). Engine prerequisites are documented in the Stop hook handbook (removed in 2.0 with the hook itself).

### Migration
Run `npx @vaubaan/harness update .` to get the new OpenCode plugin, and add `.harness/` to `.gitignore`.

## [1.3.1] — 2026-10-14

### Changed
- Rewrite the README around adoption: why, quick start, how it works, agents, skills, linters, engine support, CI example.
- Drop the "CAH" acronym: docs, rendered personas, CLI help and package description now say "harness".

## [1.3.0] — 2026-10-14

### Changed
- Publish publicly as `@vaubaan/harness` on npmjs (with npm provenance) instead of `@sbw-vaubaan/harness` on GitHub Packages. Rendered Stop hooks now call `npx -y @vaubaan/harness stop-hook`. See [the decision](docs/decisions/public-npmjs-vaubaan-scope.md).
- Switch the whole harness to English: spec, ADRs, handbooks, rendered skills, agents and commands, doc templates and the generated `AGENTS.md`. See [the decision](docs/decisions/english-canonical-language.md).
- `lint:decision-schema` now expects `Context` / `Decision` / `Consequences` / `Rejected alternatives`, and `lint:quality-schema` expects `Mechanical checks` / `Project rules` / `Accepted deviations`. The French headings are still accepted.
- License changed from MIT to Apache-2.0.

### Migration
Installations made with `@sbw-vaubaan/harness` keep a Stop hook pointing to the old package: run `vaubaan-harness uninstall .` then `vaubaan-harness init .`, or edit the hook command by hand.

## [1.2.0] — 2026-10-13

### Added
- Add the optional `docs/quality/` pillar: a single required file `docs/quality/code-quality.md` holding the project's own code-quality rules in three sections (mechanical checks, project rules, accepted deviations). See [the decision](docs/decisions/quality-optional-pillar.md) and [the handbook](docs/handbook/quality-pillar.md).
- Add `lint:quality-schema` (14th linter): enforces the required file and its three sections once `docs/quality/` exists; silent when the directory is absent.
- Ship the `code-quality.md.tmpl` template.
- `clean-code-guardian` reads the quality file first, skips what tools already check and does not report accepted deviations; `doc-audit` checks the pillar's shape and boundaries; the `coding` persona reads it before coding.
- `AGENTS.md` lists `docs/quality/code-quality.md` in the project map when the file exists.

### Migration
None required. Projects without `docs/quality/` are unaffected.

## [1.1.1] — 2026-09-20

### Removed
- Retire the abandoned coding-agent-runner coupling: `check` and `lint:gitignore-harness` no longer require `.car/`.
- Remove the CAR turn-end journal from stop hooks, including `CAR_TURN_END_LOG` and the `/var/run/car/turn-end.log` fallback. Lint decisions and native engine continuations remain active.

### Documentation
- Describe explicit CLI/API installation, archive the unimplemented supervisor proposal, and retain CAR references only as historical context. See [the retirement decision](docs/decisions/retire-coding-agent-runner-coupling.md).

## [1.1.0] — 2026-09-20

### Added
- Add `update` for existing installations, including manifest v1–v5 migration to v6, dry-run JSON plans, durable private backups and rollback on write failure.
- Preserve engine and hook selections, project skills, overrides and shared configuration; detect edits using managed-file hashes and allow explicit ownership transfer with `--preserve`.
- Preserve custom Claude/Codex hooks and MCP settings, migrate managed legacy OpenCode MCP entries conservatively, and retain the published registry tarball as a deployment artifact.

### Migration
Run the selected package version's `update --dry-run --json`, then `update`. The command updates project artifacts without changing project dependency pins. See [the update handbook](docs/handbook/project-update.md).

## [1.0.1] — 2026-09-20

[Release decision](docs/decisions/release-safety-patch-1-0-1.md) — PR #51, validation and publication conditions.

### Fixed
- Validate every managed path before installation or removal; reject traversal, absolute paths, unexpected locations and symbolic links before touching any file.
- Merge missing OpenCode MCP entries into existing configuration without replacing model, permissions or user servers. Manifest v5 tracks only entries added by the harness; re-init and uninstall preserve user changes and legacy v4 shared configuration.
- Preserve the current OpenCode persona when the stop hook injects a lint report; skip continuation when the session agent cannot be resolved.

### Tests and documentation
- Add behavior tests for path confinement, shared configuration ownership and generated OpenCode hook execution, plus migration from the actual 0.9.0 manifest.
- Record successful Codex 0.154.0 TOML-agent spawning and project MCP discovery in a trusted project; correct README commands and upgrade guidance.

### Migration
Re-run `init` with the desired engines and MCP options. Manifests v4 are upgraded to v5. Invalid or older manifests are rejected before mutation; inspect and back them up before manual migration. Older harness versions cannot manage v5 ownership metadata safely.

## [1.0.0] — 2026-09-20

Engine conformance release: every renderer now emits exactly what its engine's documentation says it reads, verified against the live CLIs (see `docs/research/2026-09-20-conformite-engines-verifiee.md` and ADR `engine-native-layouts-1-0`).

### Changed (breaking layout)
- **codex-cli** — skills render to `.agents/skills/<id>/SKILL.md` (the only repo directory Codex scans; `.codex/skills/` was never discovered); personas render as TOML `.codex/agents/<id>.toml` (`name`, `description`, `developer_instructions`); no command files (custom prompts are deprecated in favour of skills); `hooks.json` nests the Stop command under `hooks: [...]`
- **opencode** — skills render to `.opencode/skills/<id>/SKILL.md` (not `plugins/`, which only loads JS/TS modules) and are omitted when another rendered engine already exposes them (OpenCode also reads `.claude/skills/` and `.agents/skills/`); agents and commands use YAML frontmatter instead of TOML; MCP renders to `.opencode/opencode.json`; the stop hook is a real plugin module (`.opencode/plugins/harness-stop-hook.ts`, `session.idle`)
- **claude-code** — `CLAUDE.md` is now the `@AGENTS.md` import instead of a prose redirect, so the umbrella is actually loaded on every Claude Code version and provider
- Skill frontmatter emits `name:` (Agent Skills spec) instead of `id:`
- Personas no longer embed "Available skills" / "Available commands" lists nor references to the internal harness spec; `AGENTS.md` keeps a single compact "Doc-skills" list
- `lint:gitignore-harness` and `check` now require `.agents/` in `.gitignore`

### Added
- `init` removes files recorded by the previous manifest that are no longer rendered, so upgrading from 0.9.x leaves no orphans

### Migration
Add `.agents/` to `.gitignore`, then re-run `vaubaan-harness init`.

## [0.7.0] — 2026-06-13

### Changed
- `AGENTS.md` umbrella is now **method-first** — leads with "Méthode de travail" ("How we work": project map + doc-first principle) instead of listing agent personas; business context lives in `README.md` and `docs/` of the target repo

### Added
- Pre-release checklist in coding-workflow with README resync step

### Fixed
- `VERSION` export in `src/index.ts` corrected to `0.6.3` (was hardcoded to `0.6.1` — missed in v0.6.2 and v0.6.3 releases); version guard extended to cover this export (PR #48)

### Tests
- `runLinters` crash-recovery test — verifies a thrown linter error is wrapped in an error issue (PR #37)
- `runLinters` pillar-filter test — verifies `opts.pillar` excludes linters whose pillars don't match (PR #37)
- `renderCommand` unit tests — 5 cases covering unknown-engine throw, all-engines default, single-engine filter, recursive outDir creation, and warnings return (PR #39)
- `initCommand` and `writeFilesToTarget` unit tests — 5 cases covering unknown-engine throw, all-engines default, claude-code filter, stopHook flag, and recursive target-dir creation (PR #41)
- `util.ts` (linters) unit tests — 9 cases covering `findLineNumber` (string/regex/not-found), `listMarkdown` (missing-dir/excludes-README), `listAllMarkdown` (includes-README), `dirExists`, `fileExists`, `parseFrontmatter` (PR #43)
- `parseWithSchema` and `ParseError` unit tests — 6 cases covering valid parse, missing-field throw, ParseError.file/name, body trimming, no-frontmatter throw, and `parseFileWithSchema` disk read (PR #45)
- `uninstallCommand` unit tests — 5 cases covering no-manifest warning, file removal, already-missing warning, empty-dir pruning, and manifest deletion (PR #47)

## [0.6.3] — 2026-06-07

### Added
- `lint:spec-has-content` linter (warning) — flags when docs/spec/ has no markdown files (PR #27)

### Fixed
- `loadOverrides` now silently ignores a corrupt `disable.yaml` (previously threw — found by unit tests in PR #30)
- CLI `--version` flag now reports `0.6.2` (was hardcoded to `0.6.1` — missed in PR #14)

### Tests
- `loadOverrides` unit tests — 4 cases covering missing dir, empty overrides, disable.yaml load, corrupt disable.yaml graceful handling
- CLI version consistency test — `src/cli/version.test.ts` guards against `cli/index.ts` version drifting from `package.json`
- `lint:frontmatter-tracks` glob-path test coverage — 2 new cases for the `*`-glob branch of `trackedPathExists()`
- `test(mcp)`: resolveMcpIds error-path test

### Changed
- Merged duplicate `lint:tracks-drift` describe blocks in `linters.test.ts` into one (PR #19)
- Fixed dead code in `cross-links.ts`: `LINK_REGEX.lastIndex` reset moved from per-file to per-line (PR #19)

## [0.6.2] — 2026-06-06

### Added
- README Development section — local setup, test, lint, CI, PR guide (PR #6)
- Per-doc configurable `driftThreshold` frontmatter field for `lint:tracks-drift` (PR #8)
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) — runs typecheck, lint, test, build, and harness-lint on every PR and push to main (PR #9)

### Fixed
- README package name corrected from `@vaubaan/harness` to `@sbw-vaubaan/harness` (PR #4)

### Tests
- `lint:tracks-drift` now has 7 direct unit tests covering threshold boundary, glob accumulation, and directory scoping (PR #5)
- `checkCommand` unit tests — 11 cases covering README presence, required directories, and `.gitignore` entry validation including trailing-slash variant (PR #11)
- `manifest.ts` unit tests — 7 cases covering write/read round-trip, null return, zod version validation, and `stopHook` extras (PR #12)

## [0.6.1] — 2026-06-05

### Added
- Stop hook emits a JSONL turn-end event to `CAR_TURN_END_LOG` after every engine turn (`emitTurnEnd` in `src/cli/stop-hook.ts`, PR #3)
- `formatReportText` unit tests — 10 cases covering all output code paths (PR #1)
- ADR: supervisor harness design (`docs/decisions/supervisor-harness-design.md`)

### Changed
- Replaced FIFO-based turn signalling with append-only JSONL log (`/var/run/car/turn-end.log`)

## [0.6.0] — 2026-06-01

### Changed
- Dropped stack-detect; refactored stop-hook to inject lint report directly into engine payload
- Stop hook now runs all 12 linters synchronously and injects the `formatReportText` summary

## Earlier

Versions prior to 0.6.0 are not documented here. See git log for details.

