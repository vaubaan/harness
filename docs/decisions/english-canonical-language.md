---
title: English as the canonical language
status: accepted
date: 2026-10-14
author: Vaubaan core
---

# English as the canonical language

## Context

Until 1.2.0 the harness was written in French: its spec, ADRs and
handbooks, the skills, agents and commands it renders into projects, the
generated `AGENTS.md`, and the doc templates. Two linters encoded French
section headings: `lint:decision-schema` (`Contexte`, `Décision`,
`Conséquences`, `Alternatives rejetées`) and `lint:quality-schema`
(`Vérifications mécaniques`, `Règles du projet`, `Écarts assumés`).

The project is being open-sourced as `@vaubaan/harness` (see
[public-npmjs-vaubaan-scope](./public-npmjs-vaubaan-scope.md)). A
French-only harness limits contributions and adoption, and makes every
harnessed project inherit French prompts and doc skeletons.

## Decision

- English is the canonical language of the repository: docs, rendered
  content, templates, commit messages and code comments.
- The canonical ADR headings are `Context`, `Decision`, `Consequences`,
  `Rejected alternatives`. The canonical code-quality headings are
  `Mechanical checks`, `Project rules`, `Accepted deviations`. Linters
  report missing sections with these English names.
- The French headings remain accepted by both linters, accented or not,
  so projects documented in French keep passing.

## Consequences

- New projects get English templates, skills, agents and `AGENTS.md`.
- Existing French docs in harnessed projects stay valid; nothing has to
  be rewritten. Mixing languages within one ADR is accepted, since each
  section is matched independently.
- Linter messages now name the English heading even when a French
  project is missing a section.

## Rejected alternatives

### Keep French

It blocks most external contributors and imposes French prompts on
every harnessed project.

### Make the language configurable

Rendering every skill, agent and template in several languages
multiplies the content to maintain and test, for no current demand.

### English only, dropping the French headings

It would break the lint of every project already documented in French,
for a two-line regex saving.
