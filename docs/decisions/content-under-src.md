# 0008 — Content sources under `src/`, copied at build time

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

The `@vaubaan/harness` package contains two kinds of sources:

- **TypeScript code**: renderers, parser, linters, CLI — compiled by
  `tsup` to `dist/`.
- **Markdown content**: `agents/<id>.agent.md`,
  `skills/<id>.skill.md`, `commands/<id>.cmd.md`,
  `templates/<name>.md.tmpl` — not compiled, but must be present
  in `dist/` when the CLI runs on a consumer's machine
  (a `npx -y @vaubaan/harness init`, `lint`, … call).

[spec §3.1](../spec/coding-agent-harness.md) historically shows these
content folders at the package root, next to `src/`. Working
in the repo surfaced that this creates two mental roots
("where does the source live?") and complicates tooling (`tsconfig`, `biome`,
inclusion in `package.json`'s `files`).

## Decision

- **All source content lives under `src/`**:
  - `src/agents/<id>.agent.md`
  - `src/skills/<id>.skill.md`
  - `src/commands/<id>.cmd.md`
  - `src/templates/<name>.md.tmpl`
- `tsup` compiles only the `.ts` files. A post-build step
  `scripts/copy-content.mjs` copies the Markdown tree from
  `src/` to `dist/`, preserving the structure:
  `dist/agents/`, `dist/skills/`, etc.
- The `build` script chains both: `"build": "tsup && node
  scripts/copy-content.mjs"`.
- `package.json`'s `files` includes `dist` (and `README.md`) — the
  content is therefore shipped in the npm tarball.

## Consequences

- **A single source root**: `src/`. Everything outside it
  is tooling (`tsconfig.json`, `biome.json`, `scripts/`, `tests/`).
- **Predictable imports**: a renderer that resolves a relative path
  to a source skill points to `src/skills/...` in dev and
  `dist/skills/...` after build, with the same relative structure.
- **Repo consistency**: the "src/ = canonical package source" convention,
  shared by all the project's npm packages.
- **Extra build step**: a ~20-line Node script
  (`scripts/copy-content.mjs`) — marginal cost, no custom tsup plugin
  to maintain.
- **Integration tests**: tests that load source content
  point to `src/`, not `dist/`, in dev.

## Rejected alternatives

- **Keep it at the root** (`agents/`, `skills/` at the same level as
  `src/`): deviates from the `src/` = canonical source convention,
  duplicates Biome / editor configs to exclude these folders from
  TS lint.
- **Group everything under `assets/` at the root**: coupling with
  other Node tooling patterns (where `assets/` is rather
  static-web), confusing for contributors.
- **Copy nothing at build time, read from `src/` at runtime**:
  then `npm publish` does not ship the content, and the package is broken
  for consumers.
- **Bundle the content as strings in the compiled JS**:
  loses git readability, human editability of skills, and
  auditability of the shipped files.
- **Custom tsup plugin that copies during the TS build**: opaque, cuts
  off observability of the copy step; an explicit Node script is
  simpler.

See [ADR _typescript-node-stack_](./typescript-node-stack.md) on the stack and the
build; [spec §3.1](../spec/coding-agent-harness.md) on the package
hierarchy.
