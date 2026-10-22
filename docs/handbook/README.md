# Handbook

Implementation documentation for `@vaubaan/harness` — how each
subsystem actually works. Each entry has a `tracks: [...]` frontmatter
that lists the code files it depends on (drift detection via
`lint:tracks-drift`, see the `linters-architecture` entry).

The other doc pillars live elsewhere:

- `docs/spec/` — product spec (the **what**)
- `docs/decisions/` — ADRs (the **why**)
- `docs/handbook/` — *this folder* (the **how**)
- `docs/tests/` — test plan
- `docs/workflow/` — CI / branches / release

## Naming convention

**No numbering.** Each entry is a `<slug>.md` file (kebab-case) — no numeric prefix. This is deliberate:

- **No precedence logic or "ordered chapters"** — the handbook is a collection of independent entries, read à la carte.
- **Easy evolution**: add, remove, rename without breaking a numeric sequence.
- **The slug is the durable identity.**

## Entries

- [Renderer pipeline](./renderer-pipeline.md) — pivot parse →
  pure orchestrator → per-engine renderers → write to the
  target directory.
- [Capabilities matrix](./capabilities-matrix.md) —
  `CAPABILITIES_MATRIX` + `DEGRADED_CAPABILITIES`, blocking vs degraded
  warnings, adding a new capability.
- [Linters architecture](./linters-architecture.md) — the `Linter`
  interface shared by the 14 linters, the aggregator, the versioned JSON report.
- [CLI package resolution](./cli-package-resolution.md) —
  `resolvePackageDir()` in dev/prod, the role of `scripts/copy-content.mjs`,
  override via `--package-dir`.
- [Overrides loading](./overrides-loading.md) — semantics of
  `.harness-overrides/`, stock + add - disable merge, end-to-end example.
- [File lifecycle](./uninstall.md) — path validation,
  cleanup on re-init and uninstall, hook files left to the project
  when it owns them.
- [Updating a project](./project-update.md) — manifest migrations,
  preview, settings preservation, backup and rollback.
- [Stop hooks](./stop-hook.md) — lint decision, retry state,
  native responses and removal of the CAR log.
- [Project skills](./project-skills.md) — domain skills kept in
  `docs/skills/` and rendered alongside the built-in skills.
- [Quality pillar](./quality-pillar.md) — `docs/quality/code-quality.md`,
  optional pillar: shape linter, mention in `AGENTS.md`, effect
  on the code audit.

## When to update

When a file listed in a `tracks:` changes significantly.
The `lint:tracks-drift` linter (`src/linters/tracks-drift.ts`) emits a
warning beyond 10 commits on the tracked files since the handbook's last
edit. It is a signal, not a blocker — reread and update
if the described behavior has become wrong.
