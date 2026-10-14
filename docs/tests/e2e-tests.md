---
tracks:
  - src/cli/**/*.ts
  - dist/cli/index.js
last_reviewed: 2026-09-20
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
with `init`, `update`, `uninstall`, `check`, `lint`, `render` and `stop-hook`.

v1 status: run manually, to be automated.

### 2. `init` renders a complete target directory

`node dist/cli/index.js init <tmp>` (all engines by default) → we check that `<tmp>/AGENTS.md` (umbrella) + `<tmp>/CLAUDE.md` (`@AGENTS.md` import) exist, and that `<tmp>/.claude/agents/{coding,review,merge,planning}.md` + `<tmp>/.codex/agents/*.toml` + `<tmp>/.opencode/agents/...` are all written (one engine subdirectory per enabled engine).

v1 status: run manually, to be automated via subprocess.

### 3. `lint` exits with code 1 on a broken repo

`node dist/cli/index.js lint --cwd=<broken-repo>` returns `exit 1` with a text report on stdout.

v1 status: run manually, to be automated.

### 4. `lint --format=json` produces parsable JSON

The JSON contains `version`, `summary.{errors,warnings,pass}`, and `issues[]` with the expected fields.

v1 status: to be written.

### 5. Engine discovery and Codex invocation

Status: manual checks on 2026-09-20; no network dependency
and no model invocation in `npm test`.

| Engine / version | Check | Result and limits |
|---|---|---|
| OpenCode 1.14.50 | `agent list`, `mcp list`, `debug skill` | The four personas, context7 from `.opencode/opencode.json` and the skills under `.agents/skills/` are discovered. |
| OpenCode and SDK 1.14.50 | 1.0.1 plugin, real `messages` / `prompt` APIs | For `review` and `planning`, the agent passed then stored stays the current persona; simulated lint result and `noReply: true`, with no model call. |
| Codex 0.154.0 | `debug prompt-input` | The umbrella and the project skills enter the prompt. |
| Codex 0.154.0 | Persisted session, spawn of the `coding` type | Child role `coding`, instructions identical to the rendered TOML, response `CUSTOM_CODING_AGENT_OK`. |
| Codex 0.154.0 | Effective configuration, `mcp list --json`, session tools | context7 loaded in a trusted project; tools visible in the session, no functional call made. |
| Codex 0.154.0 | Same configuration in an untrusted project | Project layer disabled with an explicit approval-required diagnostic. |

The [findings and evidence](../research/2026-09-20-conformite-engines-verifiee.md#codex-cross-check-in-a-live-session)
describe the fixtures and the limits. The test did not modify the
user's global configuration. The spawn attempt in `--ephemeral` mode
failed at fork; only persisted mode is confirmed.

### 6. Migration preview on existing installations

Manual check on 2026-09-20 with the built binary:
`update <project> --dry-run --json` produced a JSON summary on five
historical local installations. A sixth installation containing
symbolic links to skills was rejected as expected, before
mutation. This check validates the CLI entry point and planning
on real manifests; it does not yet prove applying the update and
the second invocation of the published package.

## Known gaps

- Applying `update`, then a second invocation with no changes via
  the published binary: still to be exercised. The JSON preview was
  checked manually; the automated scenarios call
  `updateCommand` directly.
- No scenario currently automated via subprocess (everything is direct integration on internal functions — see `integration-tests.md`).
- No full LLM → lint hook → LLM resumption cycle is validated
  yet. The plugin tests with a simulated client and the manual check
  of the real OpenCode APIs with `noReply` cover the continuation
  protocol, not the execution of a full session.
- No E2E test coupled to a third-party orchestrator (out of the harness's scope — the harness stays autonomous).
