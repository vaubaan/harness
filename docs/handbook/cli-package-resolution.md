---
title: CLI package resolution
tracks:
  - src/cli/index.ts
  - src/cli/plan-render.ts
  - src/loader.ts
  - scripts/copy-content.mjs
  - tsup.config.ts
  - package.json
last_reviewed: 2026-10-27
---

# CLI package resolution — handbook

How the CLI and the library find `skills/`, `commands/` and `templates/`, in dev (`src/`) and once published (`dist/`). Spec: [§3.1](../spec/coding-agent-harness.md#31-in-the-vaubaanharness-package).

## Start here

- [`src/cli/index.ts`](../../src/cli/index.ts) — `resolvePackageDir()`, used by every CLI command that renders.
- [`src/cli/plan-render.ts`](../../src/cli/plan-render.ts) — `defaultPackageDir()`, used when a caller passes no `packageDir` (programmatic `init`, `lint:generated-fresh`).
- [`scripts/copy-content.mjs`](../../scripts/copy-content.mjs) — the post-build step that copies the Markdown content into `dist/`.

## Invariants

- The Markdown content lives only under `src/` (`skills/`, `commands/`, `templates/`); `tsup` compiles only the `.ts`, so `npm run build` = `tsup` + `copy-content.mjs`. Without the copy, the published package has no skills.
- In both `src/` and `dist/`, `cli/` is a sibling of `skills/`: the content root is located from `import.meta.url`, never by searching for `package.json` (fragile under pnpm / Yarn PnP).
- `loadHarness` globs `*.skill.md` and `*.cmd.md` only, non-recursively.

## Traps

- `tsup` bundles `plan-render.ts` into several entries (`splitting: false`), so its `import.meta.url` is the entry's location: `dist/init.js` finds `dist/skills/` beside it, `dist/cli/index.js` and `dist/linters/index.js` one level up. `defaultPackageDir()` checks for `skills/` next to the module before taking the parent; moving an entry in `tsup.config.ts` breaks it.
- `templates/` is copied but never read by `loadHarness`: the writer skills copy templates from it. It only looks inert.
- `tsup` cleans `dist/` but `copy-content.mjs` alone does not: a renamed skill survives in `dist/` until a full `npm run build`.
- `--package-dir` exists on `init` and `render` only. `update` always renders with the running package's own content; only its API accepts a fixture `packageDir`.

## Debug

- **`ENOENT … skills/` on `init`** — the build skipped `copy-content.mjs`; check `ls dist/skills/`.
- **`loadHarness` returns no skills** — wrong extension (`*.md` instead of `*.skill.md`) or wrong `packageDir`.
- **`lint:generated-fresh` renders a different version than expected** — it uses the content of the package that runs the lint: pin `@vaubaan/harness` as a devDependency.
