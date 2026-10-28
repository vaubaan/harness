---
title: Public publication as @vaubaan/harness on npmjs
status: accepted
date: 2026-10-14
author: Vaubaan core
---

# Public publication as `@vaubaan/harness` on npmjs

## Context

The harness is open source and must install in any project's CI with no
token or registry configuration. The private package on GitHub Packages
required authentication even for a public install. The
[spec](../spec/coding-agent-harness.md) names the package
`@vaubaan/harness`.

## Decision

The package is published publicly as `@vaubaan/harness` on npmjs, by
trusted publishing from CI. The CLI keeps the name `vaubaan-harness` and
reports stay under `.vaubaan/`.

## Consequences

- Install and lint work with `npx -y @vaubaan/harness …`, no
  authentication.
- No npm token is stored in the repository; the publish workflow holds
  the identity ([coding workflow](../workflow/coding-workflow.md)).
- Installations of the old private package are not migrated by `update`;
  a reinstall fixes them.

## Rejected alternatives

### GitHub Packages with public access
Still requires authentication to install, which blocks external adoption.

### An unscoped or longer name
`cac` is taken; other free names would rename the brand, the CLI and
`.vaubaan/`; `@vaubaan/coding-agent-harness` is longer in every `npx`.
