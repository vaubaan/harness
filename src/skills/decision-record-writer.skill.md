---
id: decision-record-writer
description: |
  Writes an ADR under `docs/decisions/<slug>.md`, only for a structural
  decision that passes the admission test below. Everything else goes to
  the spec, the handbook, the test plans or the workflow. ADRs are short:
  one decision, four sections, about 40 lines.
engines: [claude-code, codex-cli, opencode]
requires: [multi-step]
tags: [decisions, doc, writer, adr]
---

# Decision Record Writer

The decision log holds **only the structural decisions in force**: the few
choices a newcomer must know so they don't undo them, and that would cost a
lot to reverse. It is not a journal of the project, nor a place to justify
every choice. Most choices do not get an ADR.

## Admission test

Write an ADR only if **all three** answers are yes. Otherwise, do not write
it: say which test fails and where the content goes instead.

1. **Costly to reverse.** Changing it later takes more than one ordinary PR:
   it touches the code structure, the data model, a module boundary, the
   security model, or a vendor/platform the code depends on.
2. **A real alternative was weighed.** Someone could reasonably propose the
   other option again; the ADR exists to stop that debate from restarting.
   No rejected alternative worth one sentence → no ADR.
3. **It outlives the ticket.** It constrains future work across the
   codebase, not just the feature that triggered it.

## Not an ADR — where it goes

| Content | Goes to |
| --- | --- |
| Product rule (who can sign in, which channels, what is out of scope) | `docs/spec/` |
| Implementation detail: config values, file layout, env variables | the code (traps and settings outside the repo: `docs/handbook/`) |
| Test strategy and tooling (runner, target env, what is E2E) | `docs/tests/` |
| CI, branches, deploy, harness and tooling upgrades | `docs/workflow/` |
| Review rules and conventions | `docs/quality/code-quality.md` |
| Temporary choice with a planned end (stub, demo data until ticket X) | the ticket, plus a line in the handbook |
| Library choice that a single PR can swap | the PR description |
| Dependency upgrade | the commit message |

A one-sentence *why* may sit in the handbook or test plan next to the fact
it explains. Do not create an ADR just to hold it.

## Format

Hard limits — an ADR that exceeds them is rewritten, not accepted:

- **One decision per ADR.** If the Decision section needs a bullet list of
  unrelated points, split it or move the points to the handbook.
- **About 40 lines** including frontmatter, 60 at most.
- **Context**: 2-4 sentences. The forces that made the choice necessary. No
  chronology (who said what on which date), no issue history.
- **Decision**: 1-3 sentences in the present tense, stated as a rule ("X is
  Y; Z never does W"). No implementation detail unless it *is* the rule.
- **Consequences**: only what constrains future work — the rules a
  developer must follow because of this decision. 2-4 bullets. No list of
  benefits restating the decision; no operational to-dos (those go to the
  handbook).
- **Rejected alternatives**: only the options seriously weighed, one or two
  sentences each, with the reason it was rejected in this project's
  context.
- No `References` section by default; link the spec or handbook inline when
  the reader needs it.

```markdown
---
title: <The decision in one sentence>
status: accepted | proposed
date: YYYY-MM-DD
author: <name>
---

# <Title>

## Context

<2-4 sentences.>

## Decision

<1-3 sentences, a rule.>

## Consequences

- <constraint on future work>

## Rejected alternatives

### <Alternative>
<1-2 sentences: what it is, why not here.>
```

`date` is the day the decision was made. Never add a `tracks:` field: an
ADR is not refreshed when the code moves (`lint:adr-no-tracks`).

## Procedure

1. Find the candidate: the subject given by the human, or the structural
   changes of the current diff (new package or module boundary, removed
   layer, new vendor, data model, security model).
2. Run the admission test on it, out loud. If it fails, stop and name the
   doc that should receive the content.
3. Check that no ADR in `docs/decisions/` already covers it. If one does and
   the decision changed, write the new ADR and **delete the old file**
   (git keeps the history); list the old option in the new ADR's Rejected
   alternatives and update the links to it.
4. Ask the human only what the code cannot tell: the alternatives weighed
   and why they lost.
5. Draft within the format limits, submit it, iterate, then write
   `docs/decisions/<slug>.md` (short kebab-case slug, no number).
6. Update the links to the ADR in the docs that rely on it. Do not commit.

## Guardrails

- **Decide nothing for the human.** If the choice is still open, use
  `proposed` or do not write the ADR yet.
- **Fewer, shorter ADRs.** When in doubt, no ADR. The log is read in full
  by newcomers and agents; every extra ADR dilutes the ones that matter.
- **In force only.** The log holds decisions that apply today. A superseded
  or expired ADR is deleted, not kept with a status.
- **Neutral tone** in rejected alternatives: fit with this project, not
  judgement on a tool.
