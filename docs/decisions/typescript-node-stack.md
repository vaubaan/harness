---
title: TypeScript on Node, ESM only, distributed through npm
status: accepted
date: 2026-05-21
author: Vaubaan core
---

# TypeScript on Node, ESM only, distributed through npm

## Context

The harness runs as `npx -y @vaubaan/harness` in the CI of every harnessed
project and in the environments where the target engines live, which are
Node-world tools. It must install trivially, with no exotic toolchain and
no prebuild on the consumer side.

## Decision

The package is strict TypeScript compiled to ESM for Node ≥20, with one
language across CLI, renderers, parser, linters and tests.

## Consequences

- A contribution in another language or a CommonJS output is out of the
  question without a new decision.
- The minimum Node version is part of the consumers' contract: raising it
  is a breaking change.
- Build, lint and test tools are ordinary dependencies a PR may swap.

## Rejected alternatives

### Go or Rust
A static binary, but no `npx` distribution next to the engines, and a
heavier toolchain for a tool that parses YAML and writes files.

### Python
Slow startup for a CLI run on every PR, outside the engines' ecosystem.
