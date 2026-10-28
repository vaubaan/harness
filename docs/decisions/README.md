# Decisions

Architecture decisions of the `@vaubaan/harness` project. Each file
contains the 4 required sections (Context, Decision, Consequences,
Rejected alternatives), validated by `lint:decision-schema`
(see [spec §10.2](../spec/coding-agent-harness.md)).

## Convention

**A decision file holds a structural decision in force**
([decisions-as-current-state](./decisions-as-current-state.md)):

- Only for a choice that is costly to reverse, where a real alternative was
  weighed, and that outlives its ticket. About 40 lines.
- One file per decision, `<slug>.md` in kebab-case, no numbering.
- When the decision changes, a new file replaces it; the old file is
  deleted, its option moves to Rejected alternatives, links are repointed.
- Each decision references at least one other decision or the spec; an
  orphan is flagged by `lint:orphan-decisions`. No decision carries
  `tracks:` (`lint:adr-no-tracks`).
- The French section titles are still accepted by the linter.

## Decisions in force

- [A decision file holds a structural decision in force](./decisions-as-current-state.md) — admission test, about 40 lines, no History; a replaced decision is deleted (2.1.0).
- [No agent personas, no code-quality judgment](./no-personas-no-code-judgment.md) — doc-skills only; one working rule in `AGENTS.md`, the team's workflow in `docs/workflow/`, its own personas in `docs/skills/` (2.0.0).
- [Generated files are committed](./generated-files-committed.md) — `AGENTS.md`, the engine folders and the manifest are versioned; `lint:generated-fresh` fails on a stale or edited copy (2.0.0).
- [Lint in CI and pre-commit, no Stop hook](./lint-in-ci-and-pre-commit.md) — no engine hook; lint runs in CI, in a git pre-commit hook and on demand (2.0.0).
- [The harness writes only files it owns and never merges](./safe-init.md) — one planner for `init` and `update`; conflicts listed before any write, `--preserve`, transaction with backup (1.4.0, no merge since 2.0.0).
- [Public release under `@vaubaan/harness`](./public-npmjs-vaubaan-scope.md) — public package on npmjs by trusted publishing; CLI and `.vaubaan/` unchanged (1.3.0).
- [Each renderer emits exactly what its engine reads](./engine-native-layouts-1-0.md) — Codex skills under `.agents/skills/`, YAML everywhere, no Codex commands, `CLAUDE.md` as the `@AGENTS.md` import (1.0.0).
- [One pivot source per skill, one pure renderer per engine](./multi-engine-pivot-format.md) — a single `*.skill.md` / `*.cmd.md` source, no templating.
- [TypeScript on Node, ESM only](./typescript-node-stack.md) — strict TypeScript, Node ≥20, ESM, distributed through npm.
- [Mechanical linters gate, the `doc-audit` skill judges](./linters-mechanical-vs-skills.md) — every mechanizable check is a CI linter; the skill keeps judgment.
