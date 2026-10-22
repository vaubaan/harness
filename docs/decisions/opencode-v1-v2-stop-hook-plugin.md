---
title: One OpenCode Stop-hook plugin for V1 and V2
status: superseded
superseded_by: lint-in-ci-and-pre-commit
date: 2026-10-14
author: Vaubaan core
---

# One OpenCode Stop-hook plugin for V1 and V2

> **Superseded (2026-10-22)** by
> [lint-in-ci-and-pre-commit](./lint-in-ci-and-pre-commit.md): the
> OpenCode plugin is no longer rendered. The text below is kept as
> history.

## Context

The OpenCode Stop hook is a plugin file,
`.opencode/plugins/harness-stop-hook.ts`, rendered by
`src/renderers/opencode.ts` (see
[engine-native-layouts-1-0](./engine-native-layouts-1-0.md)). Until 1.3.1
it only had the OpenCode 1.x shape: a named export that receives
`{ client, directory }` and returns an `event` handler, reacting to
`session.idle` with `event.properties.sessionID`.

OpenCode 2.0 was released on 2026-09-12, and OpenCode 1.19 offers
`opencode upgrade --major`. On 2.0.29 the plugin fails to load: V2
requires a default export `{ id, setup(context) }` and reports
`Plugin must export a default definition with an id and an effect or
setup function`. Agents, skills, commands, MCP and `AGENTS.md` still
load on V2; only the Stop hook is lost, without any visible error in the
session.

V2 changes the plugin API: events come from
`context.event.subscribe()` as `{ type: "session.idle", data: {
sessionID }, location? }`, the project directory is
`context.location.directory`, and a session is resumed with
`context.session.prompt({ sessionID, text })`. A V2 session keeps its
agent, so the prompt no longer needs to name the persona.

## Decision

The rendered plugin file has a single default export that both majors
accept:

```js
export default {
  id: "vaubaan-harness-stop-hook",
  server: HarnessStopHook, // OpenCode 1.x: same behavior as before
  setup(context) { ... },  // OpenCode 2.x
};
```

- `server()` is the existing 1.x entry point, unchanged in behavior: it
  returns an `event` handler for `session.idle`.
- `setup(context)` subscribes to events in the background, ignores
  `session.idle` events located in another directory, runs the same
  `stop-hook --engine opencode` command, and sends the report back with
  `context.session.prompt`. It returns a cleanup that aborts the
  subscription.

Both entry points share the lint call. The CLI side (`stop-hook --engine
opencode`) does not change.

Verified on 2026-10-14 against the real binaries: OpenCode 1.14.50
loads the file without error, and OpenCode 2.0.29 lists the plugin as
`active`.

## Consequences

- Projects keep their Stop hook after upgrading OpenCode to 2.x, with no
  re-render needed beyond `update` to pick up the new file.
- The plugin file is longer and has two code paths to test. Unit tests
  run both entry points against mocks; loading was checked against the
  real OpenCode 1.14.50 and 2.0.29 binaries. A full turn with a model was
  not exercised on 2.x.
- Persona continuation on V2 relies on the session's persisted agent,
  not on scanning the message history.

## Rejected alternatives

### Render a V1 or V2 file depending on the installed OpenCode

The harness renders files without running the engine, and one project is
often opened with different OpenCode versions by different people.

### Keep the 1.x named export next to a V2 default export

Tried first. OpenCode 1.14.50 refuses it: once a module has a default
export, 1.x requires that export to be an object with `server()`.

### Drop V1 support

OpenCode 1.19 is still the default `latest` on npm and does not upgrade
automatically to V2.
