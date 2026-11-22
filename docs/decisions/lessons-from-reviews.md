---
title: Lessons are extracted mechanically, judged by a skill, and land in project pillars
status: accepted
date: 2026-11-21
author: Vaubaan core
---

# Lessons are extracted mechanically, judged by a skill, and land in project pillars

## Context

Reviews end in small patches that come back from one change to the next,
because the rule that would prevent them is written nowhere. The evidence
lives in the repo history, in pull requests, in the threads of a
[review session](./review-loop.md) and in agent conversations, partly
outside the repo and partly private.

## Decision

`vaubaan-harness lessons collect` extracts patch events from the repo
history, the archived review threads, the pull request data the skill
fetched and, only for the sources the project enables, engine conversation
histories; it calls no network service. The shipped skill `harn-self-improve`
groups them and proposes rules with their evidence. An accepted rule is
written in a project pillar; a rule for every project becomes an upstream
issue draft. The harness ships the procedure, never the rules. Contract:
[spec §10.5](../spec/coding-agent-harness.md#105-lessons-from-reviews).

## Consequences

- No lesson is written without the human; rejected lessons stay in
  `.vaubaan/lessons/` so they do not come back.
- Conversation histories are opt-in per source and quoted one line at a time.
- A lesson never edits a shipped skill, `AGENTS.md` or a generated file.
- Extraction is deterministic and tested; grouping and wording are the
  skill's judgment ([linters-mechanical-vs-skills](./linters-mechanical-vs-skills.md)).

## Rejected alternatives

### Mining the main branch only
Squash merges erase review patches: this repository's main branch shows one
fix commit in its whole history.

### Reading conversations by default
Private data the project never chose to expose.

### Shipping learned rules in the harness
Mixes one project's data into every project (spec §0.2).
