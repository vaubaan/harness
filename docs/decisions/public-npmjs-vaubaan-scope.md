---
title: Public publication as @vaubaan/harness on npmjs
status: accepted
date: 2026-10-14
author: Vaubaan core
---

# Public publication as `@vaubaan/harness` on npmjs

## Context

The harness is being open-sourced. Up to 1.2.0, it was published as
`@sbw-vaubaan/harness` on GitHub Packages with restricted access: every
installation required a token and a registry configuration, which makes
it unusable by an external project.

The GitHub organization `sbw-vaubaan` has been renamed `vaubaan`. The
[spec](../spec/coding-agent-harness.md) already refers to the package as
`@vaubaan/harness`.

The package name is also written into the Stop hooks rendered in
projects (`npx -y <package> stop-hook --engine <engine>`). The only
existing installations belong to the maintainer.

The open-source release starts from a new repository
`vaubaan/harness` with no history; the old one is archived
as `vaubaan/coding-agent-harness-old`.

## Decision

- The package is published as **`@vaubaan/harness`** on the public
  npmjs registry, with `access: public`. GitHub Packages is no longer used.
- The CLI keeps the name `vaubaan-harness`, and reports stay under
  `.vaubaan/`: the brand does not change, only the npm scope does.
- Rendered Stop hooks call `npx -y @vaubaan/harness stop-hook ...`.
- No migration of old hooks is provided: the mechanisms of
  [project-update-migrations](./project-update-migrations.md) remain
  unchanged, and an existing `@sbw-vaubaan/harness` command is treated
  like any command outside the current render.

## Consequences

- Installation without authentication: `npx -y @vaubaan/harness init`.
- An earlier installation keeps a Stop hook pointing to the old package;
  it is reinstalled (`uninstall` then `init`) or fixed by hand.
- `.npmrc` no longer points to GitHub Packages. Publishing on npmjs
  uses trusted publishing (OIDC) from the `publish.yml` workflow: no npm
  token is stored in the repository. The first version is published by
  hand to create the package under the `vaubaan` npm organization.

## Rejected alternatives

### Stay on GitHub Packages with public access

GitHub Packages requires authentication even to install a public
package. Adoption by external projects would be blocked.

### `@vaubaan/coding-agent-harness`

Aligned with the former repository name, but longer to type in every `npx`
and inconsistent with the spec, which already names `@vaubaan/harness`.

### An unscoped name (`cac`, `conventions-as-code`, `reins`)

`cac` is already taken by a widely used CLI framework. The other
available names would have forced a rename of the brand, the CLI and
`.vaubaan/`, with a broader migration, for an uncertain gain.

### Migrate old hooks in `update`

Recognizing the old commands would add permanent code and tests for
the maintainer's installations alone, which a reinstall is enough to
fix.
