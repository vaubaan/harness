---
name: harn-guide
description: |
  How to work in a project harnessed by @vaubaan/harness: the reading
  order, which skill answers which request, what to refuse, how to end a
  task, and when to propose a pillar the project does not have yet
  (`npx @vaubaan/harness add <pillar>`). Load it at the start of any
  task when you do not know the project's docs, when a doc you would
  need is missing, or when the project outgrows its current docs.
tags:
  - harness
  - onboarding
---

# Harness Guide

You work in a project harnessed by `@vaubaan/harness`. The repo holds two
databases: the **code** (sources, tests, configs) and the **context**
(`README.md` and `docs/`): what the code cannot say, in a few Markdown
files that point to the code for everything else. The harness is the
schema of the context, its linters and the skills that write it. This
skill is the one to read before the others: it says which reflex a
request calls for, and when to call for none.

`AGENTS.md` holds the working rule and the project map; the team's
procedure is in `docs/workflow/` when that pillar exists. Neither is
repeated here.

## The project decides how much context it keeps

A pillar is one kind of information with its place, its form and its
writer skill. **README and spec are always there. Every other pillar is
active only when its folder under `docs/` exists.** The project map of
`AGENTS.md` lists the active ones and names the others in one line.

An inactive pillar is not a gap. A project that started this week does
not need a release workflow or test plans; it needs a README and, soon, a
spec. Do not report a missing pillar as an error, do not write files for
a pillar that is not active, and never create its folder yourself.

## When a pillar becomes worth adding

Propose a pillar when the work in front of you shows the sign below, at
the moment it shows, in one sentence: what you saw, which pillar would
hold it, the command. Then continue the task; the human decides.

| Sign in the work | Pillar | Command |
|---|---|---|
| A choice that is costly to reverse is being made (a database, a framework, a protocol), or the human asks "why is it done this way?" and nothing answers | `decisions` | `npx @vaubaan/harness add decisions` |
| You had to read several files to learn an invariant, a trap or a manual step; or you are about to explain one in a commit message | `handbook` | `npx @vaubaan/harness add handbook` |
| The project has a second kind of test, a shared fixture, or a behavior nobody tests on purpose | `tests` | `npx @vaubaan/harness add tests` |
| A CI file, a second contributor, a release, a branch rule the human just told you | `workflow` | `npx @vaubaan/harness add workflow` |
| The same review remark about code style or structure comes back, or the team accepts a deviation from a common rule | `quality` | `npx @vaubaan/harness add quality` |
| Behavior visible to the user is about to change and the decision would otherwise live only in this conversation; or the human asks what the product does or what is left to build | `intents` | `npx @vaubaan/harness add intents` |
| The human talks about who the users are, what hurts them, interviews, personas, a value proposition; or you cannot say for whom a feature is built | `profiles` | `npx @vaubaan/harness add profiles` |
| A domain procedure you would otherwise re-learn each session (a tax rule, a migration runbook) | `skills` | create `docs/skills/<id>.skill.md`, then `update .` |

Rules of the proposal:

- **One pillar at a time, the one the current task needs.** Never a
  list, never "you should also".
- **Propose once.** If the human declines, do not raise it again in the
  session; do the task with what exists.
- **Until it is added, put nothing elsewhere.** No `docs/notes.md`, no
  decision hidden in a handbook, no rule in `AGENTS.md`.
- **`add` writes starter files with placeholders.** The lint fails on
  them until you fill them with the pillar's writer skill: do it in the
  same change, or do not add the pillar.
- **Removing** a pillar is deleting its folder, then
  `npx @vaubaan/harness update .`.

## Before a task: the reading order

1. `AGENTS.md`: the rule, the map, the checks.
2. `docs/intents/README.md`, when it exists: what the product does,
   where in the code, what is `proposed`. `docs/profiles/README.md`,
   when it exists: for whom, and which pain nothing relieves yet.
3. The spec section the request touches, and its intent.
4. The handbook of the module, when there is one, before opening the
   code: the invariants and the traps are there.
5. The workflow, when there is one, before committing, branching or
   opening a pull request.

## What the user says, what you do

The first question is always: does the behavior visible to the user
change? Skip a step whose pillar is inactive, or propose the pillar when
the table above says so.

| The user says | Reflex | Never |
|---|---|---|
| "I want the user to be able to…", "add a feature" | Talk until you converge, then `/harn-intent`. Show the intent, wait for validation, then code. | Open the code first. Write the intent after the code. |
| "Go", after a planning discussion | Land the decisions: `/harn-intent` for behavior, `/harn-decision` for a structural choice, `/harn-spec` for a rule or a word. Then code. | Treat the conversation as the spec: it dies with the session. |
| "Fix this bug" | Read the handbook of the module. Code, regression test. If an invariant or a trap changed, `/harn-handbook`. | Open an intent: the expected behavior does not change. |
| "Refactor", "rename", "move" | Code. Update every `tracks:` and `anchors:` that cited the old paths. | Let the lint fail on dead paths. |
| "We move to X", "we change framework" | Is it costly to reverse, with a real alternative? Then `/harn-decision` before the code. | Leave the why in a commit message. |
| "Why is it done this way?" | Look for the ADR, the handbook, the spec. Answer by citing. If nothing answers, say so. | Invent a plausible justification. |
| "Who is this for?", "here is our user research" | The `harn-intent-writer` skill writes or updates a profile; then each intent names the pain it relieves. | Invent a persona. Copy interview notes into the repo. |
| "Is it fine?", "where do we stand?" | Read-only: `npx @vaubaan/harness lint`, then `/harn-drift`, then `/harn-doc-audit`. Report: healthy, drifted, missing. | Fix things on the way. |
| "Document this" | Pick the pillar by nature: a rule → spec; a why → ADR; where and how, traps → handbook; test scope → test plan; team procedure → workflow; what the user wants → intent; who the user is → profile. | Write into `AGENTS.md`. Create `docs/notes.md`. Paraphrase the code. |
| "Change AGENTS.md / CLAUDE.md" | They are rendered. Change the source in `docs/` or `docs/skills/`, then `update .`. | Edit the file. |
| "The lint fails" | The message names the file and the skill. Fix the cause; for drift, reread the code and update the doc, not only the date. | Disable the linter. Touch `last_reviewed` without rereading. |
| "Update the harness" | The `harn-upgrade` skill (`/harn-upgrade`). | Bump the package and stop there. |

## The refusals you hold

Say no, explain in one sentence, offer the path:

- **Coding without a spec.** The subsystem you touch has no spec: stop
  and report the gap, or write its minimum with `/harn-spec`.
- **Coding before the intent**, when `docs/intents/` is active and the
  change is visible to the user. If the human insists, it is their call:
  do it, and write the intent in the same change.
- **Inventing a word.** A word missing from the spec's Vocabulary goes
  into the spec first. The same for a pain: it goes into the profile
  first.
- **Editing a generated file**: `AGENTS.md`, `CLAUDE.md`, the engine
  folders, `.harness-manifest.json`, `docs/intents/README.md`,
  `docs/profiles/README.md`. Change the source, run `update .`.
- **Adding a pillar unasked.** You propose; the human decides.

## At the end of a task

1. The docs the change touches are current, in the active pillars. No
   more.
2. `npx @vaubaan/harness update .` if an intent, a profile, a project
   skill or a pillar changed.
3. `npx @vaubaan/harness lint`: green, or fixed with the skill the
   message names.
4. Commit and open the pull request as the project's workflow says.
5. Report in three lines: what was done, what was verified, what is left
   and why. A pillar you proposed and the human declined is not "left".

Warning sign: if finishing requires editing a generated file, disabling
a linter, inventing a word or creating a pillar folder by hand, stop: a
step was skipped upstream.
