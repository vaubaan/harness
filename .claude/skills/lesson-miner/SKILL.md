---
name: lesson-miner
description: |
  Finds the small patches that reviews keep asking for, in the repo
  history, pull requests, review threads and, when the project enables
  it, agent conversations; proposes for each the rule that would have
  prevented it, with its evidence, and writes the accepted ones in the
  right project pillar.
tags:
  - review
  - quality
  - workflow
  - doc
---

# Lesson Miner

A review almost always ends in small patches: a changelog line, a test
that forgot to clean up, a word the spec did not define. Each one that
comes back is a rule written nowhere. You find them, group them, and
propose the rule, so the next change does not need the patch (spec §10.5
of the harness).

## Domains

- The **harness** ships this procedure, never a rule.
- An accepted lesson is **project** data: it lands in the project's
  pillars, written with that pillar's writer rules.
- A lesson valid for every project (a missing linter, a gap of a shipped
  skill) becomes an upstream issue draft in `.vaubaan/reports/upstream.md`;
  never a local edit of a shipped skill or a generated file.
- Candidates and refusals are **local**: `.vaubaan/lessons/`.

## Procedure

1. **Fetch the pull requests** when the project uses a hosting platform
   and its CLI is available (for example `gh`): the last 30 merged pull
   requests with their review comments and their commits (sha, message,
   files, date). Save them as `.vaubaan/lessons/prs.json`:
   `[{ "number", "url", "comments": [{ "body", "path", "line", "createdAt" }], "commits": [{ "sha", "message", "files", "date" }] }]`.
   Squash merges erase review patches from the main branch: the pull
   requests are where they live.
2. **Collect**: `npx @vaubaan/harness lessons collect`. It reads the
   history, `prs.json`, the archived review threads and, only for the
   sources the project enabled in `.harnessrc` (`lessons.sources`), the
   agent conversations. It writes `.vaubaan/lessons/events.json` and
   prints what it skipped. Never enable a conversation source yourself:
   ask the human.
3. **Group** the events by meaning: the same kind of patch, on the same
   kind of file, asked for again. Keep a group seen at least `threshold`
   times (in `events.json`, default 2). Read the rules in force first
   (`docs/quality/`, `docs/workflow/`, the handbooks, the test plans,
   `docs/skills/`): a group that a rule already covers is reported as
   **rule present, not followed**, with the rule's file and line, never
   proposed again.
4. **Propose** one lesson per group, in `.vaubaan/lessons/lessons.json`:
   `[{ "id", "rule", "evidence": [refs], "seen", "domain": "project" | "harness", "pillar": "<file § section>", "status": "proposed" }]`.
   One sentence per rule, stated so it can be checked. Where it goes:
   - checkable by a tool: the tool's config, cited in `docs/quality/`
     § Mechanical checks;
   - judgment on code: `docs/quality/code-quality.md` § Project rules;
   - a forgotten process step: `docs/workflow/coding-workflow.md`;
   - a trap of a module: the handbook that tracks it;
   - a test convention: the test plan § Conventions;
   - how the agent should work in this team: a skill in `docs/skills/`;
   - every project: `harness` domain, upstream draft.
   Run `npx @vaubaan/harness view`: the Lessons view shows them. Present
   them to the human, most seen first, with one line of evidence each.
5. **Apply** the accepted ones with the pillar's writer rules; mark them
   `accepted`. Mark the refused ones `rejected` and keep them: they must
   not come back. Run `npx @vaubaan/harness lint`.
6. **Measure** on the next run: a patch that came back after the date of
   an accepted rule is reported as **rule not followed**, with the new
   evidence.

## Guardrails

- **Propose, never decide.** Nothing lands in a pillar without the human.
- **Quote, do not copy.** One line per piece of evidence, secrets masked;
  conversation histories stay on the machine.
- **No rule from one occurrence.** Below the threshold, it waits.
- **Never commit.** The commit follows `docs/workflow/`.
