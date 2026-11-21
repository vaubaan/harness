---
title: Intents pillar
tracks:
  - src/parser/intent.ts
  - src/parser/schemas.ts
  - src/renderers/intents-index.ts
  - src/cli/plan-render.ts
  - src/cli/update.ts
  - src/cli/managed-paths.ts
  - src/linters/intent-schema.ts
  - src/linters/intent-anchors.ts
  - src/linters/intent-vocabulary.ts
  - src/linters/intent-graph.ts
  - src/linters/intent-profiles.ts
  - src/linters/intent-util.ts
  - src/linters/tracks-drift.ts
last_reviewed: 2026-11-21
---

# Intents pillar — handbook

`docs/intents/`, added on demand: one tree of intents, one file per level-1 user intent, terminal intents anchored to the code, plus the generated index. Spec: [§9.1.3](../spec/coding-agent-harness.md#913-intents); decision: [intents-pillar](../decisions/intents-pillar.md).

## Start here

- [`src/parser/intent.ts`](../../src/parser/intent.ts) — `parseIntentFile` (the grammar), `readIntentFiles` for the linters, `loadIntentFiles` for the render.
- [`src/renderers/intents-index.ts`](../../src/renderers/intents-index.ts) — the text of `docs/intents/README.md`.
- [`src/linters/intent-schema.ts`](../../src/linters/intent-schema.ts) and its four siblings — one rule each; `intent-util.ts` resolves `spec:` paths. `intent-profiles` is the link to the [profiles pillar](./pillars-on-demand.md).

## Invariants

- The parser never throws: every problem lands in `errors` and the nodes are parsed regardless, so `lint:intent-schema` reports everything at once.
- The render does throw: `loadIntentFiles` (called by `planInit`) fails `init`, `update` and `lint:generated-fresh` as soon as one intent file has an error, like an invalid project skill. The message points to `lint --pillar intents`.
- The index is a generated file like `AGENTS.md`: in `MANAGED_FILES`, in the manifest, forbidden in `.gitignore`, rendered while the folder `docs/intents/` exists, even with no intent file (it then says how to write the first one). It is what keeps a freshly added pillar's folder in git. Deleting the last intent file does not deactivate the pillar: deleting the folder does.
- The umbrella's intents line follows the active pillars and the index follows `intentFiles`; `planInit` passes `intentFiles` exactly when the pillar is active, so they change together.
- Intent files are `docs/intents/*.md` at the top level only, `README.md` excluded, sorted by file name; subfolders are never read.

## Traps

- gray-matter turns a bare `last_reviewed: 2026-11-09` into a `Date`: the schema accepts a `Date` or a string. Do not "fix" it to a string-only schema.
- Fields are found by regex on the lines right under a heading: an internal node's intent statement ends its field block, and any `word: value` line there is an unknown field. Fenced code is masked first.
- A node's `spec:` is not a Markdown link: `lint:cross-links` never sees it. `intent-schema` checks it resolves, relative to the intent file, fragment stripped; the fragment itself is not checked.
- `listMarkdown` skips every `README.md`, so the generated index is never linted as an intent file nor counted by `tracks-drift`.
- An intent file declares no `tracks:` and its frontmatter is strict: `tracks-drift` uses the union of its anchors with the default threshold, since a `driftThreshold:` key would be a schema error.
- `relieves:` and `delivers:` are parsed like `requires:` but checked by `intent-profiles` only, against the profiles the file names in `actors:`; without `docs/profiles/` their mere presence is the error.
- `deprecated` nodes are skipped by `intent-anchors` (their code may be gone) but still count in the index and the graph.
- `intent-vocabulary` reads only the frontmatter `spec:` files, never a node's `spec:`.
- The 2.2 index path stays in `MANAGED_FILES`, and `MOVED_PATHS` maps it to the new one: after the project's `git mv` of the folder, `update` carries the manifest entry and its fingerprint to `docs/intents/README.md` and overwrites the moved index instead of reporting a conflict; while the old index is still in place, `update` removes it and warns. Do not drop either entry while a 2.2 manifest may still exist.

## Procedures

- After adding or editing an intent file, run `npx @vaubaan/harness update .` and commit the index with it, or `lint:generated-fresh` fails. In this repository: `npm run build && node dist/cli/index.js update .`.
- An entity rejected by `intent-vocabulary` is added to the spec's Vocabulary first (`/spec`), never renamed into a synonym in the intent file.
