---
title: Review the context with the agent
status: implemented
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
anchors: src/view/graph.ts, src/parser/docs.ts, src/cli/view.ts, tests/integration/view.test.ts
spec: ../spec/coding-agent-harness.md#104-view-and-review

### Render the view

requires: context-graph
creates: view
anchors: src/view/html.ts, src/view/assets.ts, tests/integration/view.test.ts
spec: ../spec/coding-agent-harness.md#104-view-and-review

## Review the docs live

### Watch a change land while talking with the agent

requires: view
creates: review-session
anchors: src/review/server.ts, src/review/session.ts, src/cli/review.ts, tests/integration/review.test.ts
spec: ../spec/coding-agent-harness.md#104-view-and-review

### Comment a card and let the agent apply it

requires: view, review-session
creates: comment
anchors: src/review/server.ts, src/skills/harn-canvas-review.skill.md, src/commands/harn-canvas.cmd.md, tests/integration/review.test.ts
spec: ../spec/coding-agent-harness.md#104-view-and-review

## Turn review patches into rules

### Propose a rule for a patch that keeps coming back

requires: doc
creates: lesson
anchors: src/lessons/collect.ts, src/skills/harn-self-improve.skill.md, src/commands/harn-improve.cmd.md, tests/integration/lessons.test.ts
spec: ../spec/coding-agent-harness.md#105-lessons-from-reviews
