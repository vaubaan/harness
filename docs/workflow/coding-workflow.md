---
title: Coding workflow
tracks:
  - package.json
  - .github/workflows/ci.yml
  - .github/workflows/publish.yml
  - .husky/pre-commit
last_reviewed: 2026-10-27
---

# Coding workflow — @vaubaan/harness

Trunk-based on `main`, PRs squash-merged after green CI, releases by
pushing a `v<semver>` tag that publishes to npmjs.

## 1. CI pipeline

- [ci.yml](../../.github/workflows/ci.yml) runs `npm run ci` on every PR
  to `main` and every push to `main`: typecheck, lint, tests, build, then
  `lint:harness` (the built CLI linting this repository). It is the only
  mechanical gate.
- [publish.yml](../../.github/workflows/publish.yml) runs the same
  `npm run ci` before publishing: the PR gate and the release gate are
  one command.
- Reproduce locally with `npm run ci`. The husky pre-commit runs it too;
  it is a convenience, not a substitute (forks, containers and direct
  pushes do not have it).
- One sequential job, on purpose: the suite takes about twenty seconds,
  so parallel jobs would buy nothing, but an early failure hides later
  ones until the next push.
- CI runs on Linux with Node 20, the minimum supported
  ([typescript-node-stack](../decisions/typescript-node-stack.md)): a case-sensitive
  path or a newer Node API can pass locally and fail only there.

## 2. Env variants

- No runtime environments: this is a published package, not a deployed
  service. The machines involved are the developer's, CI, and any
  project that runs the package with `npx` or as a dev dependency.
- No environment variable changes the harness's behavior.

## 3. PR process

- Open the PR against `main`; green CI is required, plus one human
  review; squash merge.
- Add an entry under `[Unreleased]` in `CHANGELOG.md` when the change is
  user-visible.
- **Dogfooding.** This repository is harnessed by itself and its
  generated files (`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`,
  `.opencode/`, `.harness-manifest.json`) are committed. After any
  change under `src/skills/`, `src/commands/`, `src/templates/` or the
  umbrella rendering, run `npm run build && node dist/cli/index.js
  update .` and commit the result in the same PR; `lint:generated-fresh`
  fails otherwise. Never edit a generated file by hand.
- The repository's own docs follow the rules the harness ships: a change
  to a writer skill comes with the matching rewrite of this repo's
  pillar.

## 4. Branch model

- Trunk-based: `main` is the default and only long-lived branch.
- Branches `<kind>/<slug>` (`feat/…`, `fix/…`, `docs/…`), or
  `agent/<slug>` for agent-driven work; short-lived, rebased on `main`
  before merge.
- No `staging` branch; one is added only if a separate release train
  appears.

## 5. Release

- **Prepare** in a PR: bump the version in `package.json` and the
  lockfile, move `[Unreleased]` to the new version in `CHANGELOG.md`,
  check the README against the code (`readme-writer`), refresh the
  generated files.
- **Trigger**: after merge and green CI on `main`, create the tag
  `v<X.Y.Z>` on that commit and push it. `publish.yml` checks the tag
  form, runs CI, publishes with provenance, then waits until npm shows
  the version as `latest`.
- **Outside the repo**: the package on npmjs.com trusts the
  `vaubaan/harness` repository and its `publish.yml` workflow (trusted
  publishing, OIDC). No npm token exists in the repository or its
  secrets; renaming the workflow file or the repository breaks
  publishing until the trusted publisher is updated on npmjs.com.
- **Check by hand**: `npm view @vaubaan/harness@<X.Y.Z> version` and
  `npm view @vaubaan/harness dist-tags.latest`.
- **Versioning**: semver; a breaking change of the CLI, the rendered
  layout or the lint contract is a major.
- **Rollback**: never move or delete a published tag. Consumers pin the
  last good version (`npm install --save-dev @vaubaan/harness@<version>`,
  then `update .`); the fix ships as a new patch.
- **Freeze**: none.

## 6. Languages

- Documentation, code identifiers, comments and commit messages:
  English, canonical since 1.3.0.
- Domain vocabulary: English, defined in
  [spec §0](../spec/coding-agent-harness.md#0-vocabulary).
- The linters still accept French ADR and quality headings, so projects
  documented in French keep passing
  ([spec §10.2](../spec/coding-agent-harness.md)).
