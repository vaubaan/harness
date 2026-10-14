# Contributing

Thank you for your interest in `@vaubaan/harness`! This repository applies
its own conventions: it is harnessed by the package it builds.

## Setup

```bash
git clone https://github.com/vaubaan/harness.git
cd harness
npm ci
npm run build
npm link                        # make the Stop hook run this checkout
node dist/cli/index.js init .   # install the harness on this repository (dogfooding)
```

`init` renders the agents, skills and commands for Claude Code, Codex and
OpenCode. These generated files are ignored by git; re-run
`node dist/cli/index.js update .` after changing the sources under
`src/`.

`npm link` matters here. The rendered Stop hook runs
`npx -y @vaubaan/harness stop-hook`, and inside this repository `npx`
treats the project itself as that package: it looks for the
`vaubaan-harness` command on your `PATH` instead of downloading it.
The link points that command to your local build, so the hook always
checks the docs with the code you are working on. The link belongs to
the active Node installation: run `npm link` again after switching Node
versions, and `npm run build` after changing the linters.

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
