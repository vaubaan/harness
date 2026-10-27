# Handbook

What the code of `@vaubaan/harness` does not say: entry points, cross-file invariants, traps, procedures. One `<slug>.md` per feature, no numbering; each declares the code it depends on in `tracks:` (drift warning past 10 commits, `lint:tracks-drift`).

- [Renderer pipeline](./renderer-pipeline.md) — sources to native engine files, `AGENTS.md`, `CLAUDE.md`.
- [Capabilities matrix](./capabilities-matrix.md) — when a skill is skipped or rendered degraded for an engine.
- [Linters architecture](./linters-architecture.md) — the linter contract, the report, drift and freshness traps.
- [CLI package resolution](./cli-package-resolution.md) — how the content root is found in `src/` and `dist/`.
- [Overrides loading](./overrides-loading.md) — `.harness-overrides/` merge order and its traps.
- [Project skills](./project-skills.md) — `docs/skills/` rendered alongside the built-in skills.
- [Quality pillar](./quality-pillar.md) — the optional `docs/quality/code-quality.md`.
- [File lifecycle](./uninstall.md) — path checks, `init` re-runs, `uninstall`.
- [Updating a project](./project-update.md) — manifest migrations, backup and rollback, 1.x leftovers.
