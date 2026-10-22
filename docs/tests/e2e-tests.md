---
tracks:
  - src/cli/**/*.ts
  - dist/cli/index.js
last_reviewed: 2026-10-22
---

# E2E tests — @vaubaan/harness

## Scope

E2E means: the `vaubaan-harness` **CLI** is invoked as a binary, through the built `dist/`, in an environment that simulates a harnessed project. This is the external contract — not the internal API.

Contract covered: [spec §13.1](../spec/coding-agent-harness.md#131-for-the-harnessed-project)
and [renderer pipeline](../handbook/renderer-pipeline.md). Checks against
the engine CLIs are also classified at this level.

No browser stack here (no UI). If v2 introduces a UI, this file will list the corresponding Playwright scenarios.

## Test stack

- Vitest as the runner (can be extended with `execa` for subprocesses).
- Prior build: `npm run build` → `dist/cli/index.js`.
- Temporary working directory via `mkdtempSync`.

## Fixture conventions

No Vaubaan organization e2e at this stage (no cloud provider, no credentials). The "fixtures" are mini-repos in `tmpfs`.

## Sweeper / cleanup

Each test creates and deletes its `mkdtempSync` via `afterEach`. No persistent resource.

## Covered scenarios

### 1. CLI is invocable

Basic check: `node dist/cli/index.js --help` returns the formatted help
with `init`, `update`, `uninstall`, `check`, `lint` and `render`. The
`stop-hook` command is hidden: it is a no-op kept for Stop hook entries
written by 1.x, removed in 3.0.

v1 status: run manually, to be automated.

### 2. `init` renders a complete target directory

`node dist/cli/index.js init <tmp> --engines=claude-code,codex-cli,opencode`
→ we check that `<tmp>/AGENTS.md` (umbrella) + `<tmp>/CLAUDE.md`
(`@AGENTS.md` import) exist, that the skills are under
`<tmp>/.claude/skills/<id>/SKILL.md` and `<tmp>/.agents/skills/<id>/SKILL.md`,
the commands under `<tmp>/.claude/commands/` and `<tmp>/.opencode/commands/`,
and that no `.<engine>/agents/`, settings, hook or MCP file is written.
`init <tmp>` without `--engines` exits 1 with `no engine selected`. The
last line of a successful run says to commit the generated files and to
run `lint` before each commit.

v1 status: run manually, to be automated via subprocess.

### 3. `lint` exits with code 1 on a broken repo

`node dist/cli/index.js lint --cwd=<broken-repo>` returns `exit 1` with a text report on stdout.

v1 status: run manually, to be automated.

### 4. `lint --format=json` produces parsable JSON

The JSON contains `version`, `summary.{errors,warnings,pass}`, and `issues[]` with the expected fields.

v1 status: to be written.

### 5. `lint` on a harnessed repo through the published binary

`npx -y @vaubaan/harness lint` in a repo whose generated files are
committed: `lint:generated-fresh` passes when the committed files match
the render of the installed version, and fails with the `update` hint
after an edit of a generated file or an upgrade of the package.

v1 status: to be written; the self-application of this repository
(`npm run lint:harness`) exercises it with the local build.

### 6. Engine discovery

Status: manual checks on 2026-09-20 with 1.0.1, re-read on 2026-10-22;
no network dependency and no model invocation in `npm test`.

| Engine / version | Check | Result and limits |
|---|---|---|
| OpenCode 1.14.50 | `debug skill` | The skills under `.agents/skills/` are discovered. The persona and context7 checks of 2026-09-20 no longer apply: personas and MCP rendering were removed in 2.0. |
| Codex 0.154.0 | `debug prompt-input` | The umbrella and the project skills enter the prompt. |
| Codex 0.154.0 | Effective configuration in a trusted project | Project layer loaded. The context7 check of 2026-09-20 no longer applies. |
| Codex 0.154.0 | Same configuration in an untrusted project | Project layer disabled with an explicit approval-required diagnostic. |

The 1.x rows on persona spawning (`CUSTOM_CODING_AGENT_OK`) and on the
OpenCode Stop plugin are history: the [findings and evidence](../research/2026-09-20-conformite-engines-verifiee.md#codex-cross-check-in-a-live-session)
keep them. The test did not modify the user's global configuration.

### 7. Migration preview on existing installations

Manual check on 2026-09-20 with the built binary:
`update <project> --dry-run --json` produced a JSON summary on five
historical local installations. A sixth installation containing
symbolic links to skills was rejected as expected, before
mutation. This check validates the CLI entry point and planning
on real manifests; it does not yet prove applying the update and
the second invocation of the published package. Since 2.0 the same
preview lists the released paths and the legacy Stop hook warning;
to be re-run on a 1.x installation before the 2.0 release.

## Known gaps

- Applying `update`, then a second invocation with no changes via
  the published binary: still to be exercised. The JSON preview was
  checked manually; the automated scenarios call
  `updateCommand` directly.
- No scenario currently automated via subprocess (everything is direct integration on internal functions — see `integration-tests.md`).
- No check yet that the three engines load a 2.0 render (skills and
  commands only, no persona) end to end; the 2026-09-20 discovery
  checks were made on a 1.x render.
- No E2E test coupled to a third-party orchestrator (out of the harness's scope — the harness stays autonomous).
