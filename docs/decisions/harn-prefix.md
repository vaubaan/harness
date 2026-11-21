---
title: Every shipped skill and command carries the harn- prefix
status: accepted
date: 2026-11-21
author: Vaubaan core
---

# Every shipped skill and command carries the harn- prefix

## Context

The harness drops its skills and commands into folders the project, the
user and other tools share: `.claude/commands/`, `.claude/skills/`,
`.agents/skills/`. Its commands were common verbs (`/spec`, `/intent`,
`/decision`, `/drift`) and its skills plain nouns (`spec-writer`,
`doc-audit`). A project's own `/spec`, a user-level skill or another
package's command of the same name collides: the engines pick one
silently, and `init` refuses to overwrite a file it did not write. No
engine offers a namespace for a file dropped in the repo.

## Decision

Every skill and command the package ships has an id starting with
`harn-`, and a command's trigger is `/` followed by its id:
`/harn-intent` invokes `harn-intent-writer`. Project skills and overrides
are free of the rule. A test fails on a shipped id without the prefix.
Contract: [spec §5](../spec/coding-agent-harness.md#5-skillmd-format).

## Consequences

- The prefix is part of the rendered layout: changing it is a major
  version, like the 3.0 that introduced it.
- `update` warns when a project skill, an override or `disable.yaml`
  still names an id from before 3.0: it would no longer replace or
  disable the shipped one.
- Reports and paths that are not ids (`.vaubaan/reports/doc-audit.md`,
  the linter ids `lint:*`) keep their names.

## Rejected alternatives

### `hrn-`
Shorter, but nobody guesses it from "harness" when reading a list of
commands.

### Commands only
The skills sit in the same shared folders and are also invoked by name;
half a prefix leaves half the collisions.

### A namespace such as `harn:intent`
The engines reserve the colon for their own plugin namespaces, and a
command file name with a colon is not portable.
