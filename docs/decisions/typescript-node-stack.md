# 0002 — TypeScript / Node ≥20 / ESM / tsup stack

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

The harness is distributed as the `@vaubaan/harness` package and exposed
via:

- a companion CLI `vaubaan-harness` (npm bin),
- programmatic exports `./render`, `./linters`, `./parser`,
- CI linters invocable via `npx -y @vaubaan/harness lint`
  (see [spec §10.2](../spec/coding-agent-harness.md)).

It must install trivially in the CI of harnessed projects
and in any environment calling `npx -y @vaubaan/harness`, without
an exotic toolchain.

## Decision

- **Language**: TypeScript in strict mode (`tsc --noEmit` for
  typecheck, `tsup` for build).
- **Runtime**: Node ≥20 (`"engines": { "node": ">=20" }` in
  `package.json`), ESM only (`"type": "module"`).
- **Build**: `tsup` produces `dist/` with `.d.ts` types, ESM
  exports, and a shebanged CLI bin. Post-build step `scripts/copy-content.mjs`
  copies the content sources (see [ADR _content-under-src_](./content-under-src.md)).
- **Tooling**: Biome for lint + format (a single tool), Vitest for
  tests, Zod for runtime validation of frontmatters
  (see [ADR _yaml-frontmatter-zod-strict_](./yaml-frontmatter-zod-strict.md)).

## Consequences

- **Installation**: `npx -y @vaubaan/harness lint` works without
  a prebuild on the consumer project side.
- **DX**: a single language across renderers, linters, CLI and
  tests. Trivial refactoring between modules.
- **npm ecosystem consistency**: standard Node-world stack, easy
  sharing of utilities with harnessed projects.
- **Node 20**: we allow ourselves `node:test`, top-level await, native
  fetch, without polyfills.

## Rejected alternatives

- **Go**: an appealing static binary, but no npm ecosystem to
  be consumed by `npx`, and the content (`*.skill.md`) remains
  Markdown — no gain on the hot path.
- **Rust**: overkill for a tool that parses YAML and writes
  files; compile time and toolchain complexity
  disproportionate.
- **Python**: slow startup for a CLI invoked in CI on every PR,
  and not native to the Node-world tools where the target engines live.
- **CommonJS**: ESM is the 2026 standard, all our target engines
  support it.
- **Raw Vite / esbuild bundler**: `tsup` wraps them with a
  config that matches our case (lib + bin + dts) in fewer lines.
