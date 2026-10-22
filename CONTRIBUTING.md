# Contributing

Thank you for your interest in `@vaubaan/harness`! This repository applies
its own conventions: it is harnessed by the package it builds.

## Setup

```bash
git clone https://github.com/vaubaan/harness.git
cd harness
npm ci
npm run build
```

This repository is harnessed by itself and its generated files
(`AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.opencode/`,
`.harness-manifest.json`) are committed, so a fresh clone needs no
`init`. After changing anything under `src/skills/`, `src/commands/` or
`src/templates/`, re-render and commit the result:

```bash
npm run build && node dist/cli/index.js update .
```

`lint:generated-fresh` fails otherwise, locally and in CI. There is no
engine hook: the `husky` pre-commit runs `npm run ci`, which ends with
`lint:harness` on this repository.

## How we work

Doc-first: understand the docs → fill the gaps → code → update the
docs → commit.

- A structural decision → an ADR under `docs/decisions/` (`/decision`).
- A behavior change → the relevant handbook under `docs/handbook/` (`/handbook`).
- A missing spec for the subsystem you touch → open an issue first.

The project map is in the [README](./README.md#documentation).

## Pull requests

1. Branch from `main` with a `<kind>/<slug>` branch (`feat/…`, `fix/…`, `docs/…`).
2. Run `npm run ci` (typecheck, lint, tests, build, `lint:harness`): CI rejects the PR otherwise.
3. Add an entry under `[Unreleased]` in `CHANGELOG.md` if the change is user-visible.
4. Open the PR against `main`; a maintainer reviews it and squash-merges it.

Write commit messages, docs and code comments in English.

By contributing, you agree that your contributions are published under the project's [Apache 2.0 license](./LICENSE).
