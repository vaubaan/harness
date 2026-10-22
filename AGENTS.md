# How we work

This file describes **how to work in this project**. The **business context** (what the project does, how to run it, which subsystems it contains) lives in `README.md` and `docs/`. Read them first.

## Project map

- `README.md` — pitch, quick start, scripts. Entry point.
- `docs/spec/<subsystem>.md` — *what* and *why* (tech-agnostic).
- `docs/handbook/<feature>.md` — *how it actually works* today.
- `docs/decisions/<slug>.md` — ADRs: structural choices and rejected alternatives.
- `docs/tests/integration-tests.md` & `e2e-tests.md` — core scenarios.
- `docs/workflow/coding-workflow.md` — CI, branches, PR, release. How this team works: follow it.

## Doc-first

The order is: **understand the docs → fill the gaps → code → update the docs → commit**. If the docs are silent or stale on something you change, fill the gap upfront with the doc-skill writers — not downstream, not after the fact.

- Missing spec for a subsystem you touch → **do not code**, report the gap.
- Implicit structural decision in your changes → an ADR (`/decision`).
- Changed feature behavior → update the matching handbook (`/handbook`).
- Suspected code ↔ doc drift → `/drift` before moving on.

## Checks

Run `npx @vaubaan/harness lint` before you commit; CI runs the same linters on every pull request. Fix what it reports with the skill it suggests.

The files the harness generates (`AGENTS.md`, `CLAUDE.md`, the `.claude/`, `.codex/`, `.agents/` and `.opencode/` folders, `.harness-manifest.json`) are committed. Never edit them by hand: change their source in `docs/` or `.harness-overrides/`, run `npx @vaubaan/harness update .`, and commit the result. The linter fails when a generated file no longer matches its render.

## Doc-skills

- `decision-record-writer` (`/decision`) — Wizard to write an ADR under `docs/decisions/<slug>.md` (no
- `doc-audit` (`/doc-audit`) — Audits the completeness and freshness of the docs (6 pillars: README,
- `drift-detector` (`/drift`) — Detects code ↔ doc drift. For each doc file that declares a
- `handbook-writer` (`/handbook`) — Documents the actual implementation of a feature or subsystem under
- `readme-writer` (`/readme`) — Maintains `README.md` at the repo root. Syncs the links to the other
- `spec-writer` (`/spec`) — Human-guided wizard to write or update a `docs/spec/<name>.md`
- `test-plan-writer` (`/test-plan`) — Updates `docs/tests/integration-tests.md` and/or
- `workflow-writer` (`/workflow`) — Updates `docs/workflow/coding-workflow.md`. Reads `.github/workflows/`,
