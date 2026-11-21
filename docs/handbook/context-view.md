---
title: Context view and review sessions
tracks:
  - src/parser/docs.ts
  - src/view/*.ts
  - src/cli/view.ts
  - src/review/*.ts
  - src/cli/review.ts
  - src/skills/harn-canvas-review.skill.md
  - tests/integration/view.test.ts
  - tests/integration/review.test.ts
last_reviewed: 2026-11-21
---

# Context view and review sessions — handbook

`vaubaan-harness view` and `vaubaan-harness review …`: the context graph, the offline page rendered from it, and the local server of a review session. Spec: [§10.4](../spec/coding-agent-harness.md#104-view-and-review); decisions: [context-view](../decisions/context-view.md), [review-loop](../decisions/review-loop.md).

## Start here

- [`src/view/graph.ts`](../../src/view/graph.ts) — `buildGraph`: one pass per pillar, then skills, rendered files, linters, lessons, lint attachment, drift.
- [`src/parser/docs.ts`](../../src/parser/docs.ts) — the readers the graph shares with `decision-schema`, `cross-links`, `intent-vocabulary`; `driftOf` lives in `src/linters/tracks-drift.ts` for the same reason.
- [`src/view/html.ts`](../../src/view/html.ts) — `renderView`: the map (`renderCanvas`), one focus layer per document (`renderFocus`), the other views, one detail panel per node; [`assets.ts`](../../src/view/assets.ts) holds the inline style and script.
- [`src/review/server.ts`](../../src/review/server.ts) — routes, watcher, batches; [`session.ts`](../../src/review/session.ts) — snapshot, restore, archive.

## Invariants

- A fact the view shows comes from a reader a linter uses. Adding a field to the view starts in `src/parser/docs.ts` or a linter, never in `graph.ts` alone.
- Deterministic bytes: nodes sorted by id, edges by (from, type, to), no timestamp, card ids from a hash of the node id, layout computed in TypeScript. A `Date.now()` or a `Map` iteration over unsorted input in `graph.ts` or `html.ts` breaks the view test.
- Content is in the markup; the script only toggles classes, pans, zooms and, in a session, swaps `main`, `#side` and `#hs` with the server's fresh render (`replaceChildren`, never `innerHTML`).
- The map has one card per document; `mapOf` gives the document a node belongs to (its parent chain), and every count, link and diff on a card aggregates its family. A new node type either belongs to a document or stays off the map: never a card of its own.
- Each document's focus layer is rendered in the page, hidden; selecting a card only toggles classes and zooms to the layer's `data-box`. The page grows with documents × neighbours (about 0.7 MB for this repo).
- Only the server writes `.vaubaan/review/session.json`; the CLI talks to it over HTTP with the token from `server.json` and `x-harness-author: agent`.
- `discard` touches exactly the files of `REVIEWED_GLOBS` (`README.md`, `docs/**`), compared by sha256 with the snapshot.

## Traps

- The watcher needs `fs.watch` with `recursive: true`, available on Linux from Node 20 only (the minimum we support).
- A rebuild with lint takes seconds on a large repo and blocks the event loop: the server pushes a lint-free rebuild first, then lints 50 ms later and pushes again. Two `update` events per change is normal.
- `review next` long-polls up to 540 s through `node:http`: `fetch` gives up after 300 s without headers.
- `history.replaceState` throws on a `file://` page: the static view opened from disk must not depend on it.
- The "Before" mode of the differences hides added cards and shows removed ones, but a changed card shows its current content; the detail panel has no old version.
- The map layout is a search: `renderCanvas` tries shelf widths and frame proportions and keeps the one read at the highest zoom on a 16:10 screen. Adding a pillar frame can move every other frame. More documents always mean a smaller fit zoom: the view test pins 0.7 on a fixture the size of this repository in November 2026 and 0.5 with 40 decisions, never on the live repository, whose docs grow.
- On a phone the detail panel takes the whole width: a focus is then readable only after closing it.
- The server binds `127.0.0.1`. When the human's browser runs on another machine (a remote agent), `--host` widens it; the token still applies, the `Host` check is then skipped for `0.0.0.0`.
- Source links of the static page are `../../<path>`: they resolve only while the page stays in `.vaubaan/view/` of the repo. In a session the server serves `docs/**` and `README.md` read-only for the same links.
- Tests that run git under the pre-commit hook inherit its `GIT_*` variables; `tests/setup/isolate-git.ts` clears them (see the [integration test plan](../tests/integration-tests.md)).

## Debug

- **Blank view, script error** — open the browser console; a DOM emulator (jsdom) loading the page catches most script errors.
- **`review start` hangs, then "did not start"** — run `vaubaan-harness review serve .` in the foreground to see the error.
- **"a review session is live"** but nothing answers — a killed server leaves `server.json`; `review keep` or `review discard` end the session from the files alone.
