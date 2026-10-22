# Content sources under `src/`, copied at build time

**Date:** 2026-05-21
**Status:** accepted
**Author:** Vaubaan core

## Context

The package contains two kinds of sources: TypeScript code (renderers,
parser, linters, CLI), compiled by `tsup` to `dist/`, and Markdown
content (`skills/<id>.skill.md`, `commands/<id>.cmd.md`,
`templates/<name>.md.tmpl`), not compiled but needed in `dist/` when
the CLI runs on a consumer's machine.

Keeping the content folders at the package root next to `src/` created
two mental roots and complicated the tooling (`tsconfig`, `biome`, the
`files` list of `package.json`).

## Decision

- All source content lives under `src/`: `src/skills/`,
  `src/commands/`, `src/templates/`.
- `tsup` compiles only the `.ts` files. A post-build step,
  `scripts/copy-content.mjs`, copies the Markdown tree from `src/` to
  `dist/`, preserving the structure.
- `build` chains both: `tsup && node scripts/copy-content.mjs`.
- `package.json`'s `files` includes `dist`, so the content ships in the
  tarball.

## Consequences

- One source root. Everything outside `src/` is tooling.
- A path to a skill is `src/skills/...` in dev and `dist/skills/...`
  after build, with the same relative structure; the content root is
  found by the presence of `skills/`
  ([handbook](../handbook/cli-package-resolution.md)).
- Integration tests load content from `src/`.

## Rejected alternatives

- **Keep the content at the root**: deviates from the `src/` convention
  and duplicates lint exclusions.
- **Group everything under `assets/`**: suggests static web assets,
  confusing for contributors.
- **Read from `src/` at runtime**: `npm publish` would not ship the
  content.
- **Bundle the content as strings in the compiled JS**: loses git
  readability and the auditability of the shipped files.
- **A custom tsup plugin**: opaque; an explicit Node script is simpler.

See [typescript-node-stack](./typescript-node-stack.md) on the stack.

## History

- 2026-05-21: decided with four content folders, `agents/` included.
- 2026-10-22, c45b319: `src/agents/` removed
  ([no-personas-no-code-judgment](./no-personas-no-code-judgment.md)).
