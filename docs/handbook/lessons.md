---
title: Lessons from reviews
tracks:
  - src/lessons/collect.ts
  - src/skills/lesson-miner.skill.md
  - tests/integration/lessons.test.ts
last_reviewed: 2026-11-21
---

# Lessons from reviews — handbook

`vaubaan-harness lessons collect` extracts patch events; the `lesson-miner` skill groups them and proposes rules. Spec: [§10.5](../spec/coding-agent-harness.md#105-lessons-from-reviews); decision: [lessons-from-reviews](../decisions/lessons-from-reviews.md).

## Start here

- [`src/lessons/collect.ts`](../../src/lessons/collect.ts) — one reader per source, `collectLessonEvents` sorts and writes `.vaubaan/lessons/events.json`.
- [`src/skills/lesson-miner.skill.md`](../../src/skills/lesson-miner.skill.md) — the judgment: fetch pull requests, group, propose, apply.

## Invariants

- The CLI calls no network service. Pull requests reach it only as `.vaubaan/lessons/prs.json`, written by the skill with the platform's own CLI.
- A conversation source is read only when `.harnessrc` lists it in `lessons.sources`; `--sources` cannot enable it.
- An event quotes one line of at most 200 characters, with token-like strings masked.

## Traps

- Squash merges erase review patches from the main branch: on this repository the history alone yields almost nothing. The pull requests are the source.
- The wording match is deliberately broad (`lint`, `missing`, `review`…): `lint:cross-links` in a subject matches. The skill sorts; the collector never decides.
- Claude Code stores a project's history under `~/.claude/projects/<repo path, every non-alphanumeric character as ->`: a repository moved or opened from a worktree has its own history folder.
- Messages sent while the agent works are `queue-operation` entries, not `user` ones, and often reach the conversation as a `user` message too: the reader dedupes by text per file. They are the strongest signal of a correction.
- Codex and OpenCode histories are not read yet (spec §15.2).

## Debug

- **No event from conversations** — check `lessons.sources` in `.harnessrc.json`, then that the history folder exists for this exact path.
- **`prs.json is not valid JSON`** — the skill wrote it; rerun its fetch step.
