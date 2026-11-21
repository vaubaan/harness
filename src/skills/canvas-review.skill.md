---
id: canvas-review
description: |
  Runs a review session of the project's context: opens the view of the
  meta database, keeps it live while the human talks or comments, applies
  each comment to its source with the writer rules of its pillar, and
  answers in the thread. Never commits; the human keeps or discards.
engines: [claude-code, codex-cli, opencode]
requires: [multi-step, inline-exec]
tags: [view, review, doc]
---

# Canvas Review

You run a **review session** (spec §10.4 of the harness): the human reads
the context on a canvas instead of the Markdown, and changes it by talking
to you or by commenting cards. The CLI is the tool, you are the loop. The
docs stay the only source: you edit `docs/` and `README.md`, the view
follows.

## Domains: where a change may land

- **Project** (`docs/`, `README.md`, `docs/skills/`): the only place you
  write.
- **Harness** (linters, shipped skills, the files rendered under
  `.claude/`, `.agents/`, `.opencode/`, `AGENTS.md`): never edited. A
  comment on a linter or a shipped skill becomes an upstream issue draft
  in `.vaubaan/reports/upstream.md` (title, the comment, why it holds for
  every project); suggest a `.harness-overrides/` trial if the human wants
  it now. A comment on a generated file changes its source in `docs/` or
  `.harness-overrides/`, then `npx @vaubaan/harness update .`.
- **Local** (`.vaubaan/`): the session's own files. Never edit
  `.vaubaan/review/` by hand: go through `review reply`, `review note`.

## Procedure

1. **Start.** Run `npx @vaubaan/harness review start`: it snapshots the
   docs, detaches its server and returns. Give the human the URL it
   prints. If a session was not ended, ask: `--resume`, `keep` or
   `discard`. The server listens on the local machine only; if the human
   cannot reach it, say so and offer `--host <interface>` (the token
   still protects it).
2. **Talk mode** (`/canvas talk`, or whenever the human speaks): apply
   what they ask to the docs, one pillar at a time, with that pillar's
   writer rules (`spec-writer`, `intent-writer`, `decision-record-writer`,
   `handbook-writer`, `test-plan-writer`, `workflow-writer`,
   `readme-writer`). After each change, say why in the journal:
   `npx @vaubaan/harness review note "<the human's request in a few words>"`.
   The view shows the change within two seconds, with the differences
   and the lint delta.
3. **Comment mode** (`/canvas comment`, or when the human says they
   commented): wait for a batch with
   `npx @vaubaan/harness review next`. Exit `0` prints the batch as JSON;
   exit `3` means no batch yet, call it again; exit `4` means the human
   ended the review, go to step 5. For each thread of the batch:
   - a question: answer from the docs, cite the file; edit nothing;
   - a change of visible behavior: a `proposed` intent (`intent-writer`);
   - a structural choice: an ADR, admission test first
     (`decision-record-writer`);
   - a wrong map of the code: read the code, then the handbook
     (`handbook-writer`); never touch only `last_reviewed`;
   - a new word: the spec Vocabulary first;
   - a harness element: the upstream draft above.
   Then answer: `npx @vaubaan/harness review reply <thread> --body "<what
   you did, or your question>" --change <path>:<line>` (one `--change`
   per edited place). Unclear comment: reply with a question, change
   nothing.
4. **After each batch** run `npx @vaubaan/harness update .` if an intent,
   a project skill or an override changed, then
   `npx @vaubaan/harness lint`. Fix what you broke; report what you could
   not. Back to step 3.
5. **End.** Summarize the changes (`review status` lists them) and ask the
   human: keep or discard. `review keep` leaves them uncommitted;
   `review discard` restores `docs/` and `README.md` as they were at the
   start, untracked files included. The commit, if any, follows
   `docs/workflow/`.

## Guardrails

- **Never commit, never push.** The session is a draft; the human decides.
- **Never edit code.** A comment that needs code becomes a `proposed`
  intent or a note in your reply.
- **Never edit a generated file, a shipped skill or the session files.**
- **Decide nothing for the human**: a comment you would have to
  interpret broadly gets a question back.
- **One thread, one answer**: every submitted thread gets a reply, even
  "no change: <why>".
