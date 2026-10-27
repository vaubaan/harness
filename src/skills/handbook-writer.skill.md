---
id: handbook-writer
description: |
  Writes or updates `docs/handbook/<slug>.md`: only what an agent cannot
  read quickly in the code (entry points, cross-file invariants, traps,
  config living outside the repo, manual procedures). Never a paraphrase of
  the code. Keeps the `tracks: [...]` frontmatter valid for drift detection.
engines: [claude-code, codex-cli, opencode]
requires: [multi-step]
tags: [handbook, doc, writer]
---

# Handbook Writer

A handbook is read by an agent about to work on a feature. Its job is to
save that agent time and mistakes, at the smallest size that still does.
The code is the source of truth for what the code does: the handbook never
restates it.

## Content test

Keep a sentence only if **reading the code would not give it quickly**:

- **Entry points**: the 2-5 files to open first, one line each.
- **Cross-file invariants**: a rule that holds across several files and
  that no single file states (e.g. "only this file imports the vendor SDK").
- **Traps and non-obvious behaviour**: why the code does something that
  looks wrong or unusual, when the next reader would "fix" it.
- **What lives outside the repo**: settings in a dashboard, an external
  registration, secrets, integrations, and how to mirror them.
- **Manual procedures**: checklists, rotations, steps nobody can automate.
- **Debug**: symptom → cause, when the cause is not visible from the
  symptom.

## Never in a handbook

- File-by-file or function-by-function descriptions, route tables,
  component lists, model fields, algorithm steps: read the code and tests.
- Usage examples of an API whose signature is in the code.
- Product rules (→ spec), structural choices (→ ADR), test strategy
  (→ `docs/tests/`), CI (→ `docs/workflow/`).
- Anything an agent would learn by opening the first entry point.

## Format

- **Target 30-60 lines**, 80 at most. Bullets, no prose paragraphs.
- Sections are optional; use only those with content, in this order:
  `Start here`, `Invariants`, `Traps`, `Outside the repo`, `Procedures`,
  `Debug`.
- Link code files rather than describing them. Links must resolve
  (`lint:cross-links`).
- First line after the title: one sentence on the scope, and a link to the
  spec if it exists.

```markdown
---
title: <Feature>
tracks:
  - <paths whose change can make this handbook wrong>
last_reviewed: YYYY-MM-DD
---

# <Feature> — handbook

<One sentence. Spec: [..](../spec/..).>

## Start here
- [`file`](../../path) — <what it is the entry to>

## Traps
- <non-obvious behaviour and why>
```

## Procedure

1. Read the spec and the code of the feature. Never document a file you
   have not read.
2. For each candidate sentence, apply the content test. If an agent would
   learn it by opening the file, drop it.
3. When updating, also delete what has become readable in the code or no
   longer true.
4. Set `tracks:` to the files whose change can invalidate what the
   handbook says (existing paths or globs only, no placeholders), and
   `last_reviewed` to today.
5. Submit the draft, iterate, write the file. Do not commit.

## Guardrails

- **Smaller is better.** When in doubt, leave it out: a stale line costs
  more than a missing one, because the code answers the missing one.
- **No disguised ADR or spec.** A one-line *why* next to a trap is fine; a
  debate between options is an ADR.
- **Do not guess.** Every statement is checked against the code or the
  external system it describes.
