---
tracks:
  - package.json
  - tsconfig.json
  - biome.json
  - vitest.config.ts
  - tsup.config.ts
  - .github/workflows/ci.yml
  - .github/workflows/publish.yml
last_reviewed: 2026-10-14
---

# Coding workflow — @vaubaan/harness

## CI pipeline

| Trigger | Job | Command | Typical duration |
|---|---|---|---|
| `push` to `main`, `pull_request` to `main` | `ci` | `npm run ci` (typecheck → lint → test → build → lint:harness) | < 20 s |
| Tag `v*` | `publish` | install → tag validation → `npm run ci` → package version → `npm publish --provenance` → check of the published version and of `latest` | Varies with the registry |

Sources: [ci.yml](../../.github/workflows/ci.yml) and
[publish.yml](../../.github/workflows/publish.yml). The checkout and
setup-node actions use v7; the project is tested with Node 20. The
publish job disables automatic dependency caching.

## Env variants

No runtime environment variants at this stage — this is a published npm package, not a deployed service. The only environments are: the developer's machine, the CI, and any calling machine that consumes the package via `npx`.

## PR process

- Feature branch pushed → PR opened against `main`.
- Green CI required (typecheck + lint + tests + build).
- At least one human review.
- Squash merge by default.

No separate `staging` branch for now — one will be added if the project adopts a separate release train.

## Branch model

Trunk-based: `main` is the default branch. Features branch off as `feature/<slug>` or `agent/<slug>` (agent branches).

## Commit / merge conventions

- Conventional commits encouraged but not enforced.
- Commit messages, docs and code comments are in English.
- Squash-merge by default.

## Release

Release = public publication of `@vaubaan/harness` on npmjs
(`https://registry.npmjs.org/`). `publishConfig` in `package.json`
sets this registry and public access; no authentication is required
to install. See
[the decision](../decisions/public-npmjs-vaubaan-scope.md).

| What | How |
|---|---|
| Trigger | Push of a `v<X.Y.Z>` tag created on the validated release commit of `main`; the workflow listens to `v*` tags and validates their semver form. |
| Build | `npm ci`, then `npm run ci`; package version derived from the tag with `npm version --no-git-tag-version --allow-same-version`, then `npm publish --provenance --access public`. |
| Post-publication check | `npm view` must find the exact tag version and `dist-tags.latest` must equal it; six attempts five seconds apart, then the job fails if a value is missing or differs. |
| Provenance | The job has the `id-token: write` permission; npm attaches a provenance attestation linking the package to the workflow and the commit. It requires a public repository. |
| Versioning | Semver. Breaking changes = major bump. |
| Rollback | Pin the last stable version in consumers, then publish a new fixed patch. Never move a published tag. |
| Freeze | No planned freeze at this stage |

### Pre-release checklist

1. Green CI on `main`.
2. **Resync README.md** — check that the sections (install, usage, features, scripts) reflect the current state of the code. Run the `readme-writer` skill if needed.
3. Bump version + tag.
4. Wait for the `publish` workflow to succeed, including its check of
   the published version and of the `latest` dist-tag.

The bump prepares `package.json`, the lockfile and the versions exposed
by the CLI and the API before the release validations. After merge and
green CI on `main`, create then push the matching tag. Local check,
without credentials:

```bash
npm view @vaubaan/harness@<X.Y.Z> version
npm view @vaubaan/harness dist-tags.latest
```

The job uses the `NPM_TOKEN` secret (npmjs automation token with
publish rights on the `vaubaan` organization), exposed as
`NODE_AUTH_TOKEN` only to the `npm publish` step.

Once a new version is installed, `update --dry-run --json` inspects
the project migration, then `update` applies it with a backup; this
step does not change the consuming project's npm pins. See
[updating a project](../handbook/project-update.md).

To temporarily roll back to a stable version in a project:

```bash
npm install --save-dev @vaubaan/harness@<stable-version>
```

## Notes

- The package is consumed directly via `npx -y @vaubaan/harness ...` or via a local install in a harnessed project's CI. No external runtime image rebuild to trigger.
