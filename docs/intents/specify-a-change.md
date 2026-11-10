---
title: Specify a change before coding it
status: implemented
actors: [maintainer, coding-agent]
spec: ../spec/coding-agent-harness.md
last_reviewed: 2026-11-10
---

# Specify a change before coding it

As a maintainer, I want every visible change of behavior to exist as an
intent with its acceptance criteria before any code, so that the decision
survives the session that took it and any agent can deliver it.

## Propose the change

### Write the intent with its acceptance criteria

creates: intent
anchors: src/skills/intent-writer.skill.md, src/commands/intent.cmd.md, src/parser/intent.ts, src/linters/intent-schema.ts
spec: ../spec/coding-agent-harness.md#913-intents

### Name only words the spec defines

requires: intent
anchors: src/linters/intent-vocabulary.ts, src/linters/intent-graph.ts
spec: ../spec/coding-agent-harness.md#913-intents

### Link the intent to the ticket that tracks it

status: proposed
requires: intent
acceptance:
- An optional `issue:` field on any node accepts one or several references, `#123`, `owner/repo#123` or a URL; any other shape fails `lint:intent-schema`.
- The rendered index `docs/intents/README.md` shows the reference next to the node's status.
- Spec §9.1.3, the intent template and `intent-writer` document the field; `/intent` copies the reference when the intent names a ticket.

## Deliver the change

### Close the intent in the pull request that ships it

requires: intent
creates: anchor
anchors: src/skills/intent-writer.skill.md, src/linters/intent-anchors.ts, src/linters/tracks-drift.ts
spec: ../spec/coding-agent-harness.md#913-intents

## Read the backlog

requires: intent
anchors: src/renderers/intents-index.ts
spec: ../spec/coding-agent-harness.md#913-intents
