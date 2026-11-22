---
name: harn-upgrade
description: |
  Moves a project to a newer version of @vaubaan/harness: pins the
  package, previews and applies `update`, resolves the conflicts it
  lists, then applies the migration notes of every version crossed
  (kept in this skill, one entry per release). Use it when the human
  asks to update or upgrade the harness, or when `lint:generated-fresh`
  fails after the package version changed.
tags:
  - harness
  - upgrade
---

# Harness Upgrade

You move this project from the harness version that rendered it to a
newer one. `update` re-renders the generated files; it does not choose a
version, and it cannot do what a version asks of the project's own
files. That part is yours, and it is written below, version by version.

This file is rendered by the version *currently installed*: its notes
stop at that version. The notes of the target version arrive with it,
which is why step 3 comes before step 5.

## Procedure

1. **Read where the project is.** `harnessVersion` in
   `.harness-manifest.json` is the version that rendered it (absent
   before 1.1). Read how the project runs the harness: a dev dependency
   in the package manifest, a pinned `npx @vaubaan/harness@<version>` in
   CI or in the pre-commit hook, or the unpinned `npx`.
2. **Choose the target with the human.** The latest version, unless
   they name one. Read its changelog entries between the two versions
   (`npm view @vaubaan/harness versions`, then the `CHANGELOG.md` of the
   package). Crossing a major version: say so, and what it removes,
   before touching anything.
3. **Start from a clean tree**, on a branch named as the project's
   workflow says, so the upgrade is one reviewable change. Then pin the
   target wherever the project pins the harness: the dev dependency
   (`npm install --save-dev @vaubaan/harness@<target>`), the CI file,
   the hook. All of them, to the same version.
4. **Preview.** `npx @vaubaan/harness update . --dry-run`. It writes
   nothing. Read the writes, the removals and every warning.
5. **Re-read this skill once the preview is clean**: after step 6 the
   file on disk is the target version's, with the notes you need.
   Until then, read them from the package:
   `node_modules/@vaubaan/harness/dist/skills/harn-upgrade.skill.md`.
6. **Resolve conflicts, then apply.** `update` stops before any write
   when a generated path holds a file it did not write, or a generated
   file edited by hand. For each one: move the content to its source
   (`docs/`, `docs/skills/`, `.harness-overrides/`), or keep the file as
   the project's with `--preserve <path>` and tell the human it will no
   longer be refreshed. Never delete a file to get past the check. Then
   `npx @vaubaan/harness update .`.
7. **Apply the migration notes** below, for every version after the one
   the project was on, up to the target, in order.
8. **Lint.** `npx @vaubaan/harness lint`. A new version may bring new
   checks: fix each with the skill its message names, never by disabling
   the linter. A check you cannot satisfy in this change is a finding
   for the human, not a reason to pin back silently.
9. **Report**, then commit as the project's workflow says: from which
   version to which, what was removed, what the notes made you change,
   which files are preserved and therefore not refreshed, what is left.

## Guardrails

- **Never skip a major.** From 1.x, go to the last 2.x first, lint
  green, commit, then to 3.x.
- **Never edit a generated file** to make it match: change its source
  and run `update .`.
- **A backup exists.** `update` prints the folder where it kept the
  previous content of every file it touched. On a failed apply it rolls
  back by itself; mention the folder in your report.
- **Rollback** is pinning the previous version and running `update .`
  again; a version's notes say when that is not enough.
- **Do not adopt new pillars during an upgrade.** A new version may
  offer some; that is a separate decision (`harn-guide`).

## Migration notes

One entry per release that asks something of a project, newest first.
"Nothing to do" means `update .` is the whole migration.

### 3.0.1

Nothing to do. `lint:intent-graph` ignores `deprecated` intents: their
warnings go away, and an active intent that requires an entity only a
deprecated intent creates now warns. Then make an active intent create
it, or drop the requirement.

### 3.0

Breaking: pillars are active by presence, and only the README is
required; every shipped skill and command is prefixed with `harn-`.

- **Commands and skills are renamed**: `/spec` is `/harn-spec`, `/intent`
  is `/harn-intent`, `/harness-upgrade` is `/harn-upgrade`, and so on;
  `spec-writer` is `harn-spec-writer`, `harness-guide` is `harn-guide`.
  `update` removes the old files and writes the new ones by itself.
  Then search the project's own docs, scripts and CI for the old command
  names and replace them. `update` warns on every project skill
  (`docs/skills/`), override (`.harness-overrides/skills/`) or
  `disable.yaml` entry that still names an old id: rename it, or it
  becomes an extra skill instead of replacing the shipped one.

- **Nothing breaks for a project that has the six former pillars**:
  their folders exist, so they are active and their skills stay.
- **A pillar folder you had only because the lint demanded it** (test
  plans that say nothing, a workflow nobody follows): ask the human
  whether to keep it. Deleting the folder, then `update .`, removes its
  skill, its command and its checks.
- **`AGENTS.md` changes**: its map and rules now hold a line only for an
  active pillar, and one line names the others. If the project preserved
  `AGENTS.md`, tell the human it no longer reflects the pillars.
- **`lint:doc-layout`** no longer requires any folder; it now fails on a
  pillar folder that holds no file. Fill it or remove it.
- **`check`** no longer requires `docs/`: only the README and the
  `.gitignore` entries.
- **The `stop-hook` command is gone.** 2.x kept it as a silent no-op for
  hook entries written by 1.x. Search `.claude/settings.json` and
  `.codex/hooks.json` for `@vaubaan/harness stop-hook` and remove the
  entry: it now fails on every turn. `update` warns when it finds one.
- **Custom skills** in `docs/skills/` or `.harness-overrides/` keep
  working; they may now declare `pillars: [...]` to be rendered only
  while one of those pillars is active.
- **Programmatic callers of `render()`**: `hasQualityDoc` is replaced by
  `activePillars`.
- New, nothing to do unless wanted: the `add <pillar>` command, the
  `profiles` pillar, the `harn-guide` and `harn-upgrade` skills; the
  view of the context (`vaubaan-harness view`) and review sessions
  (`/harn-canvas`); lessons from reviews (`/harn-improve`), which read
  agent conversations only if the project lists them under
  `lessons.sources` in `.harnessrc`. All of them write only under
  `.vaubaan/`, already gitignored.

### 2.4, 2.3.1

Nothing to do.

### 2.3

The journeys pillar became the intents pillar. Only for a project that
has `docs/journeys/`:

1. `git mv docs/journeys docs/intents`, then `update .`.
2. Replace `/story` and `/journey` by `/harn-intent` in the project's own
   docs, and `lint:journey-*` by `lint:intent-*` in a lint configuration.

### 2.2, 2.1

Nothing to do.

### 2.0

Breaking: generated files are committed, and the Stop hook is replaced
by the lint in CI and in the pre-commit hook.

1. After `update .`: stale agent files and the OpenCode plugin are
   removed; files 1.x wrote into engine settings (`.mcp.json`,
   `.claude/settings.json`, `.codex/hooks.json`, `.codex/config.toml`,
   `.opencode/opencode.json`) are left in place and are now the
   project's.
2. Remove the `npx -y @vaubaan/harness stop-hook` entry from
   `.claude/settings.json` or `.codex/hooks.json`.
3. Remove `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `.agents/`,
   `.opencode/`, `.harness-manifest.json`, `.harness/` and `.mcp.json`
   from `.gitignore`; keep `.harness-overrides/` and `.vaubaan/`. Commit
   the generated files.
4. Run `npx @vaubaan/harness lint` in CI and add it to the pre-commit
   hook.

### 1.x

- From `@sbw-vaubaan/harness` (before 1.3): `uninstall .` with the old
  package, then `init . --engines=<list>` with the new one.
- From 0.x or 1.0: re-run `init . --engines=<list>`; a manifest older
  than version 4 is migrated by `update`, never by `init`.
- Within 1.x otherwise: `update --dry-run`, then `update`.
