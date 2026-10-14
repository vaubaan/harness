---
tracks:
  - src/cli/stop-hook.ts
  - src/cli/stop-hook.test.ts
  - src/cli/index.ts
  - src/stop-hook/**/*.ts
  - src/renderers/opencode.ts
  - src/renderers/opencode-hook.test.ts
last_reviewed: 2026-10-14
---

# Stop hooks — in-session documentation checks

`vaubaan-harness stop-hook --engine claude|codex|opencode` checks the
project at the end of a turn. `src/cli/stop-hook.ts` reads the engine's payload,
calls the shared core, then returns the native response. Installing
the hook files is described in the [renderer pipeline](./renderer-pipeline.md).

## Decision and local state

`decide` (`src/stop-hook/core.ts`) applies the conditions in this order:

1. `HARNESS_LINT_DISABLE=1` or `stop_hook_active`: let the turn finish.
2. Clean Git or lint passed: reset the state then let the turn finish.
3. Same lint report as the previous attempt: stop the
   retries and explain the lack of progress.
4. Limit exceeded: stop the retries. The default is three attempts,
   adjustable via `HARNESS_LINT_MAX_ATTEMPTS`.
5. Otherwise: record the attempt and pass on the lint report.

`src/stop-hook/state.ts` keeps the counter and the report hash in
`.harness/state/lint-<session>.json` under the project. The session
identifier is sanitized before building the path. This local retry-control
state remains in use after the removal of CAR.

## Responses per engine

The adapters live in `src/stop-hook/adapters/`:

| Engine | Payload | Retry requested |
|---|---|---|
| Claude | `session_id`, `stop_hook_active` | JSON `{decision: "block", reason}` on stdout, exit 0. |
| Codex | `session_id`, `stop_hook_active` | Same JSON response, exit 0. |
| OpenCode | `sessionID` or `session_id` | Report on stderr, exit 2, relayed by the native plugin. |

Without a retry, the adapters return exit 0; a stop due to the limit or
lack of progress adds its explanation on stderr. The OpenCode
plugin keeps the current persona when injecting: see
[the OpenCode continuation](./renderer-pipeline.md#opencode-hook-continuation).

On Claude Code and Codex, stderr from a hook that exits 0 is not shown
to the user, so these explanations only appear in the engines' debug
logs.

## When each engine runs the hook

Rendering the hook is not always enough; each engine has its own gate.
Checked on 2026-10-14 against Claude Code 2.1.299, Codex 0.155.1 and
OpenCode 1.14.50 / 2.0.29.

| Engine | Gate |
|---|---|
| Claude Code | Interactive sessions hold back project hooks until the workspace trust dialog is accepted. `-p` and SDK sessions run them directly. |
| Codex | The project must be trusted, **and** the hook itself must be reviewed and trusted, at the startup "Hooks need review" prompt or with `/hooks`. Trust is stored per project in the user's `~/.codex/config.toml`. `codex exec` skips untrusted hooks silently unless `--dangerously-bypass-hook-trust` is passed. `init` prints a reminder when it renders the Codex hook. |
| OpenCode | No approval step. The plugin loads on 1.x through `server()` and on 2.x through `setup()`. |

## Removal of the CAR signal

Since 1.1.1, the hook no longer writes an end-of-turn log to
`/var/run/car/turn-end.log`. `CAR_TURN_END_LOG` is ignored, even if it
remains set in the environment. The old `emitTurnEnd` helper has been
removed; no warning about an inaccessible CAR log is produced.
The lint and continuation responses remain as described
above. Decision: [removal of the CAR couplings](../decisions/retire-coding-agent-runner-coupling.md).

## Diagnostics

- No lint: check the kill switch, `stop_hook_active` and the Git
  state. `defaultGitStatus` also treats a Git error as an empty state.
- Hook never called: check the engine's gate above (Claude workspace
  trust, Codex project and hook trust).
- Retries stopped: read stderr and the report; the counter is bounded
  and the progress check compares the content of the lint report.
- No OpenCode continuation: check exit code 2, a non-empty report
  and the presence of a persona in the session history.
- An external tool expects a CAR file: adapt that tool; the
  harness provides no replacement notification.

The CLI and core tests live next to these modules. The limitation on
a full loop with a real model remains documented in
[the E2E plan](../tests/e2e-tests.md).
