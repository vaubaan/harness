---
title: E2E test plan
tracks:
  - tsup.config.ts
  - src/cli/index.ts
  - package.json
last_reviewed: 2026-11-21
---

# E2E test plan

## Scope

- The built `vaubaan-harness` CLI invoked as a binary (`dist/`, or the
  published package through `npx`), in a project that simulates a
  harnessed one: the external contract of
  [spec §13.1](../spec/coding-agent-harness.md#131-for-the-harnessed-project).
- The engines themselves (Claude Code, Codex, OpenCode) discovering the
  rendered skills and commands.
- Internal functions are [integration](./integration-tests.md).

## Stack

- No automated E2E suite yet: every check at this level is manual.
- The closest automated check is `npm run lint:harness`: the built CLI
  lints this repository at the end of `npm run ci`, locally and in CI.
- Engine checks use each engine's own debug commands (for example
  Codex `debug prompt-input`, OpenCode `debug skill`), never a model
  call.

## Conventions

- Run on a disposable project in a temporary directory, never on a real
  project or the user's global engine configuration.
- No cloud resource, no credential: nothing to sweep.
- A manual check is recorded with the engine version and the date, in
  the PR or the release notes, not in this file.

## Known gaps

- ⚠️ **No subprocess suite** (spec §13.1) — `init`, `update`, `lint`
  (text and JSON) and `check` through the built binary are not
  automated. Priority: high, before relying on the CLI output format.
- ⚠️ **Engines loading a 2.x render** (spec §4.3) — the last discovery
  checks were made on a 1.x render; to redo on each engine before a
  release that changes the layouts.
- ⚠️ **The view in real browsers** (spec §10.4) — checked by hand in
  headless Chromium (map, focus, light and dark, 400 px wide) with
  screenshots; no automated screenshot test, Firefox and Safari not
  checked, pinch only on paper. Priority: medium.
- ⚠️ **`review start` as a detached process** (spec §10.4) — the
  integration suite runs the server in-process; the spawn, `server.json`,
  `review next | reply | keep | discard` through the binary were checked
  by hand on the acme-billing fixture.
- ⚠️ **`update` applied through the published package**, then a second
  invocation with no change (spec §13.1, updating) — only the dry-run
  preview was checked by hand on real installations.
