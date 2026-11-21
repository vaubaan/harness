---
title: Review the context with the agent
status: proposed
actors: [maintainer, coding-agent]
spec: ../spec/coding-agent-harness.md
last_reviewed: 2026-11-21
---

# Review the context with the agent

As a maintainer, I want to see the whole context on one canvas and change it
by talking or commenting, so that a review takes minutes and leaves a rule
behind instead of a patch.

## See the whole context on one canvas

### Build the context graph

requires: doc
creates: context-graph
spec: ../spec/coding-agent-harness.md#104-view-and-review
acceptance:
- `vaubaan-harness view` writes `.vaubaan/graph.json`, byte-identical across two runs on the same tree.
- Every node carries a stable id, its domain, its source file and line, and the lint issues attached to it.
- No lint result changes when the linters read the docs through the parsers the graph uses.

### Render the view

requires: context-graph
creates: view
spec: ../spec/coding-agent-harness.md#104-view-and-review
acceptance:
- `.vaubaan/view/index.html` opens from disk and makes no network request.
- Every card links to its source file and line.
- The view shows the state of the context, the intent tree, the vocabulary, the decisions, the linters and the skills.

## Review the docs live

### Watch a change land while talking with the agent

requires: view
creates: review-session
spec: ../spec/coding-agent-harness.md#104-view-and-review
acceptance:
- A doc edit appears on the open view within two seconds, pan and zoom kept.
- The differences mark added, changed and removed cards against the session start, with the lint delta.
- `review discard` restores `docs/` and `README.md` byte for byte, untracked files included, and touches no code.

### Comment a card and let the agent apply it

requires: view, review-session
creates: comment
spec: ../spec/coding-agent-harness.md#104-view-and-review
acceptance:
- A comment pinned to a card survives a reload and a rebuild.
- `/canvas` answers every submitted comment with the file and line it changed, or with a question.
- A comment on a linter or a shipped skill yields an upstream issue draft, never an edit of a generated file.
- Nothing is committed by the session.

## Turn review patches into rules

### Propose a rule for a patch that keeps coming back

requires: doc
creates: lesson
spec: ../spec/coding-agent-harness.md#105-lessons-from-reviews
acceptance:
- `/lessons` lists each lesson with its evidence, its domain and the pillar it would go to.
- A patch seen once, or covered by a rule in force, is not proposed; a rule in force that is not followed is reported as such.
- An accepted lesson lands in a project pillar; a lesson for every project becomes an upstream issue draft.
- Conversation histories are read only for the sources the project enables.
