---
title: A decision file is a current state, not an event
status: accepted
date: 2026-10-22
author: Vaubaan core
---

# A decision file is a current state, not an event

## Context

The decisions pillar was append-only. A reversal produced a new file,
the old one stayed with a `superseded_by` pointer, and every later
correction was pasted as a banner at the top of the live file. After
five months this folder held 31 files: 10 of them dead, 12 of them
opening with one to three stacked "Updated context / Amended /
Superseded" notes, for about 36k tokens. A reader, human or agent, had
to replay the history to know what is in force, and paid for every
token of it.

The other pillars are current state already: the spec, the handbook,
the test plans and the workflow are rewritten when the project changes,
and git keeps the old versions. Decisions were the one exception, for a
reason that no longer holds: the *why* and the rejected alternatives
are the part git does not make easy to find, but they belong to the
topic, not to the date.

The 2.0 model ([spec](../spec/coding-agent-harness.md), compaction) asks
the context to stay short and free of contradictions. This decision
applies it to the pillar that drifted most.

## Decision

- **One file per topic, describing the decision in force.** Context,
  Decision, Consequences and Rejected alternatives state the current
  position. When the position changes, the file is rewritten.
- **A `## History` section carries the reversals**, one line each: date,
  the commit when known, one sentence saying what changed. Anything
  longer lives in git.
- **A superseded file is deleted.** Its one-line summary moves into the
  History of the decision that replaced it. Links to it are repointed
  to the successor.
- **The index lists only decisions in force.**
- **The linters are unchanged.** `lint:decision-schema` still requires
  the four sections; `History` is an extra one. `lint:orphan-decisions`
  still flags a file nothing references. `lint:adr-no-tracks` stands:
  a decision points to the files that embody it in prose, not through
  `tracks:`.
- **Compaction is a transaction.** It is triggered by a `doc-audit`
  finding (contradiction, dead file, stacked banners) or by the context
  budget, and the rewrite is reviewed like any change.

## Consequences

- The first compaction, applied the same day, removed 10 files, folded
  12 banners into History lines and cut the pillar by roughly a third.
- A reader opens one file per topic and gets the position in force on
  the first screen.
- Archaeology costs one `git log --follow` on the file, or a checkout
  of the commit named in the History line.
- A decision that is merely a merge or release record (what PR, what
  tag) is not a topic: it becomes a History line of the decision it
  applied.

## Rejected alternatives

### Keep superseded files with pointers

What we had. The pointer chain grows, the banners stack, and the dead
files are the largest ones in the folder because nobody trims a text
marked as history.

### One ADR per reversal

Doubles the file count on every change of mind and leaves the reader to
diff two prose documents to find what changed.

### Number the files and keep them immutable

Numbering was rejected at the start (the slug is the identity) and
immutability is the problem being solved.

## History

- 2026-10-22: decided and applied in the first compaction pass of the
  2.0 branch.
