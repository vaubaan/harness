---
tracks:
  - src/linters/quality-schema.ts
  - src/templates/code-quality.md.tmpl
  - src/skills/clean-code-guardian.skill.md
  - src/renderers/common.ts
  - src/cli/init.ts
last_reviewed: 2026-10-13
---

# Quality pillar (`docs/quality/`)

An **optional** pillar that holds a project's own code quality
rules. A single required file: `docs/quality/code-quality.md`.
Contract: [spec §9.1.2](../spec/coding-agent-harness.md). Rationale for the
choice: [ADR quality-optional-pillar](../decisions/quality-optional-pillar.md).

## Overview

Without this file, `clean-code-guardian` audits with its generic
criteria. With it, the audit has a project standard: what the
tools already check, the local judgment rules, and the deliberate
deviations not to report.

Four parts of the harness react to the presence of the pillar:

| Component | File | Effect |
|---|---|---|
| Linter `lint:quality-schema` | `src/linters/quality-schema.ts` | Requires the required file and its 3 sections as soon as `docs/quality/` exists. |
| `AGENTS.md` umbrella | `src/renderers/common.ts` (`buildUmbrellaBody`) | Adds a line to the "Project map". |
| Skill `clean-code-guardian` | `src/skills/clean-code-guardian.skill.md` | Reads the file first and adapts the audit. |
| Skill `doc-audit` | `src/skills/doc-audit.skill.md` | Checks the shape and boundaries of the pillar. |

## How to use it

Copy the template `src/templates/code-quality.md.tmpl` (shipped under
`templates/` in the package) to `docs/quality/code-quality.md`, then
fill in the three sections:

- `## Mechanical checks` — a tool / configuration file /
  scope / command table. You **point** to the
  configuration (formatter, linter, type-checker); you do not copy
  any rule.
- `## Project rules` — the rules no tool checks.
- `## Accepted deviations` — the generic rules not followed, with the
  reason or a link to the ADR.

There is neither a writer skill nor a dedicated command: the file is edited
by hand. Rerun `init` or `update` after creating it so that
`AGENTS.md` mentions it.

## How it works

### The linter

`qualitySchema` follows three branches:

1. `docs/quality/` absent → no issue. This is what makes the pillar
   optional; `docs/quality` is not in `REQUIRED_DIRS` of
   `src/linters/doc-layout.ts`.
2. Directory present, `code-quality.md` absent → a
   `missing required cardinal file` error.
3. File present → one error per missing section among the three
   regexes of `REQUIRED_SECTIONS`.

The regexes require an exact level-2 heading (`##`), anchored on the
whole line; a level-3 or suffixed heading does not count. The French
section names remain accepted by the linter for backward compatibility
(accents optional: `Regles du projet` is accepted).

The linter declares the `quality` pillar: `lint --pillar quality`
selects it, along with the linters of the `all` pseudo-pillar.

The file has no `tracks:`. `lint:frontmatter-tracks` and
`lint:tracks-drift` do not scan `docs/quality/`: like an ADR,
the file sets a standard and does not follow the state of the code.

### Rendering

`planInit` (`src/cli/init.ts`) checks whether
`<target>/docs/quality/code-quality.md` exists and passes `hasQualityDoc` to
`render`. `buildUmbrellaBody` then adds the line to the project
map. The check is on the **file**, not the directory: an
empty `docs/quality/` produces no line. `update` goes through the
same path as `init`.

The `render()` API accepts `hasQualityDoc` directly for a caller
that does not use the CLI; the default value is `false`.

### The audit

The skill applies each section differently:

- mechanical checks → items excluded from the audit;
- project rules → audited in addition to the generic criteria;
- accepted deviations → not reported as defects.

An accepted deviation never neutralizes a critical escalation
(plaintext secret, typing bypass on business logic, untested
business logic).

## How to debug

- **Lint fails after creating the directory** → the required file
  is missing or a section heading differs. Run
  `vaubaan-harness lint --pillar quality` to isolate the issues.
- **`AGENTS.md` does not mention the file** → rerun `init` or
  `update`; the umbrella is computed at render time, not at lint time.
- **The audit ignores a rule** → check that it is under
  `## Project rules` and phrased so it can be verified on review.

## Limits

- No mechanical detection of overlap with ADRs, the handbook
  or the tool configuration: `doc-audit` is the judge of that.
- No `tracks:`: a tool replaced without updating the file
  is only detected on review or by `doc-audit`.
