---
title: Journeys pillar
tracks:
  - src/parser/journey.ts
  - src/parser/schemas.ts
  - src/renderers/journeys-index.ts
  - src/cli/plan-render.ts
  - src/linters/journey-schema.ts
  - src/linters/journey-anchors.ts
  - src/linters/journey-vocabulary.ts
  - src/linters/journey-graph.ts
  - src/linters/journey-util.ts
  - src/linters/tracks-drift.ts
last_reviewed: 2026-11-09
---

# Journeys pillar — handbook

The optional `docs/journeys/`: one file per level-1 user intention, leaves anchored to the code, plus the generated index. Spec: [§9.1.3](../spec/coding-agent-harness.md#913-journeys); decision: [journeys-pillar](../decisions/journeys-pillar.md).

## Start here

- [`src/parser/journey.ts`](../../src/parser/journey.ts) — `parseJourney` (the grammar), `readJourneys` for the linters, `loadJourneys` for the render.
- [`src/renderers/journeys-index.ts`](../../src/renderers/journeys-index.ts) — the text of `docs/journeys/README.md`.
- [`src/linters/journey-schema.ts`](../../src/linters/journey-schema.ts) and its three siblings — one rule each; `journey-util.ts` resolves `spec:` paths.

## Invariants

- The parser never throws: every problem lands in `errors` and the nodes are parsed regardless, so `lint:journey-schema` reports everything at once.
- The render does throw: `loadJourneys` (called by `planInit`) fails `init`, `update` and `lint:generated-fresh` as soon as one journey has an error, like an invalid project skill. The message points to `lint --pillar journeys`.
- The index is a generated file like `AGENTS.md`: in `MANAGED_FILES`, in the manifest, forbidden in `.gitignore`, rendered only while a journey exists, removed by `update` when the last one goes (and the then empty `docs/journeys/` is pruned).
- The umbrella's journeys line and the index change together: both come from the same `journeys` passed to `render()`.
- Journey files are `docs/journeys/*.md` at the top level only, `README.md` excluded, sorted by file name; subfolders are never read.

## Traps

- gray-matter turns a bare `last_reviewed: 2026-11-09` into a `Date`: the schema accepts a `Date` or a string. Do not "fix" it to a string-only schema.
- Fields are found by regex on the lines right under a heading: an internal node's story sentence ends its field block, and any `word: value` line there is an unknown field. Fenced code is masked first.
- A node's `spec:` is not a Markdown link: `lint:cross-links` never sees it. `journey-schema` checks it resolves, relative to the journey file, fragment stripped; the fragment itself is not checked.
- `listMarkdown` skips every `README.md`, so the generated index is never linted as a journey nor counted by `tracks-drift`.
- A journey declares no `tracks:` and its frontmatter is strict: `tracks-drift` uses the union of its anchors with the default threshold, since a `driftThreshold:` key would be a schema error.
- `deprecated` nodes are skipped by `journey-anchors` (their code may be gone) but still count in the index and the graph.
- `journey-vocabulary` reads only the frontmatter `spec:` files, never a node's `spec:`.

## Procedures

- After adding or editing a journey, run `npx @vaubaan/harness update .` and commit the index with it, or `lint:generated-fresh` fails. In this repository: `npm run build && node dist/cli/index.js update .`.
- An entity rejected by `journey-vocabulary` is added to the spec's Vocabulary first (`/spec`), never renamed into a synonym in the journey.
