---
tracks:
  - src/linters/types.ts
  - src/linters/index.ts
  - src/linters/util.ts
  - src/linters/readme-presence.ts
  - src/linters/decision-schema.ts
  - src/linters/adr-no-tracks.ts
  - src/linters/frontmatter-tracks.ts
  - src/linters/tracks-drift.ts
  - src/linters/cardinal-files.ts
  - src/linters/gitignore-harness.ts
  - src/linters/orphan-decisions.ts
  - src/linters/quality-schema.ts
  - src/cli/index.ts
  - src/cli/check.ts
last_reviewed: 2026-10-13
---

# Linters architecture

The 14 mechanical linters that keep the documentation of a harnessed repo
consistent. They all follow the same pattern, are composable and run as
pure functions from `src/linters/`.

## The shared interface

`src/linters/types.ts:11-16`:

```ts
export interface Linter {
  id: string;                            // ex "lint:readme-presence"
  pillars: ReadonlyArray<string>;        // ex ["handbook", "tests"]
  defaultSeverity: Severity;             // "error" | "warning"
  run(repoRoot: string): LintIssue[];    // pure: takes the repo, returns issues
}
```

A `LintIssue` (`src/linters/types.ts:3-9`) carries `{ linter, severity, file, line?, message }`.

The contract is **stateless** and **pure**: no linter mutates the disk;
each call builds its issues from a read-only view of the repo.
This is what makes it possible to test each linter individually
(`src/linters/linters.test.ts`).

## The 14 linters

All registered in `ALL_LINTERS` (`src/linters/index.ts:18-33`), in
execution order:

| Linter                      | Pillars                          | Severity |
|-----------------------------|----------------------------------|----------|
| `readme-presence`           | `readme`                         | error    |
| `readme-sections`           | `readme`                         | error    |
| `doc-layout`                | `all`                            | error    |
| `cardinal-files`            | `tests`, `workflow`              | error    |
| `decision-schema`           | `decisions`                      | error    |
| `adr-no-tracks`             | `decisions`                      | error    |
| `frontmatter-tracks`        | `handbook`, `tests`, `workflow`  | error    |
| `tracks-drift`              | `handbook`, `tests`, `workflow`  | warning  |
| `spec-tech-agnostic`        | `spec`                           | error    |
| `spec-has-content`          | `spec`                           | warning  |
| `cross-links`               | `all`                            | error    |
| `orphan-decisions`          | `decisions`                      | warning  |
| `gitignore-harness`         | `repo-root`                      | error    |
| `quality-schema`            | `quality`                        | error    |

`quality-schema` is the only linter attached to an **optional** pillar:
it reports nothing as long as `docs/quality/` does not exist (see
[quality pillar](./quality-pillar.md)).

## The aggregator

`runLinters(repoRoot, opts)` (`src/linters/index.ts:40-66`):

1. **Filters** the `ALL_LINTERS` list by `opts.only` (whitelist by id) or
   `opts.pillar` (a linter passes if one of its `pillars` matches, or if it
   declares the `"all"` pseudo-pillar).
2. **Runs** each linter in a `try/catch` — an internal crash becomes
   a `severity: "error"` issue on `<internal>` (`src/linters/index.ts:48-57`),
   and the rest continues.
3. **Aggregates** the counters: `pass = (errors === 0)`. Warnings
   do **not** affect `pass`.

The final report is a versioned `LintReport` (`version: 1`,
`src/linters/types.ts:18-22`):

```ts
{ version: 1, summary: { errors, warnings, pass }, issues: [...] }
```

## The CLI

`vaubaan-harness lint` in `src/cli/index.ts:96-112`:

- `--pillar <pillar>` — filter by pillar
- `--format text|json` — `text` (default) prints the report via
  `formatReportText` (`src/linters/index.ts:75-91`), `json` dumps the raw
  report. The JSON is versioned by `version: 1`: a consumer can
  rely on it.
- `--cwd <dir>` — root of the audited repo (default `.`)
- **Exit code**: `0` iff `summary.pass`. So warnings → exit 0, errors → exit 1.

## Linter examples

### Generated files and `.gitignore`

`src/linters/gitignore-harness.ts` requires the entries
`.harness-overrides/`, `.harness-manifest.json`, `.claude/`, `.codex/`,
`.opencode/`, `.agents/`, `.vaubaan/`, `AGENTS.md`, `CLAUDE.md` and
`.mcp.json`. A directory entry without a trailing slash is also
accepted. The `check` layout check (`src/cli/check.ts`) checks
the same entries, except `.mcp.json`, as well as the documentation pillars.

Since 1.1.1, neither check requires `.car/`. A legacy
entry may remain in the project; these functions read the file
without modifying it. This removal follows
[the retirement of CAR](../decisions/retire-coding-agent-runner-coupling.md).

### File existence — `readme-presence`

The simplest one (`src/linters/readme-presence.ts`): checks that
`README.md` exists at the root via `fileExists` (`src/linters/util.ts:7-9`). One
issue or zero. Serves as a minimal template for the other "presence" linters (see
`cardinal-files.ts`, `gitignore-harness.ts`).

### Markdown sections — `decision-schema`

`src/linters/decision-schema.ts:4-9` declares 4 regexes for the required sections
of ADRs (`## Context`, `## Decision`, `## Consequences`,
`## Rejected alternatives`) then iterates via `listMarkdown(repoRoot, "docs/decisions")`
(`src/linters/util.ts:15-22`). `listMarkdown` skips `README.md` files —
*important*: the README of a pillar directory is never linted for
its content (but it is required elsewhere, by `readme-sections`).

### Frontmatter + path existence — `frontmatter-tracks`

`src/linters/frontmatter-tracks.ts` walks `docs/handbook/`, `docs/tests/`,
`docs/workflow/` (`TRACKED_DIRS`, `src/linters/frontmatter-tracks.ts:7`).
For each markdown file it:

1. Extracts the frontmatter via `parseFrontmatter` (`src/linters/util.ts:36-39`,
   a wrapper around `gray-matter`).
2. Checks that a `tracks: [...]` array exists.
3. For each string entry, calls `trackedPathExists` — if the string
   contains `*`, expansion via `fast-glob`, otherwise `existsSync`.

This linter is the reason for this very file's frontmatter.

### Drift via git log — `tracks-drift`

`src/linters/tracks-drift.ts` cross-references two things:

- `gitLastCommitForPath(repoRoot, docFile)` (`src/linters/util.ts:46-65`) —
  date of the last commit that touched the doc, via
  `git log -1 --format=%H:%ct`.
- `gitCommitsSince(repoRoot, codeFile, sinceCommit)` (`src/linters/util.ts:67-87`) —
  number of commits that touched the tracked file since that date.

Beyond `DEFAULT_DRIFT_THRESHOLD = 10` (`src/linters/tracks-drift.ts:12`),
warning. It is the incentive to update the handbook when the implementation
changes — it **never breaks CI** (severity `warning`).

Each doc can override this threshold with `driftThreshold: <n>` in its
frontmatter (`src/linters/tracks-drift.ts:36-39`). Useful for critical
handbooks that must be updated sooner.

## How to write a new linter

1. Create `src/linters/<id>.ts`. Export an object conforming to `Linter`. Reuse
   the helpers from `src/linters/util.ts` for reading (`fileExists`,
   `readText`, `listMarkdown`, `parseFrontmatter`, git helpers).
2. Add it to `ALL_LINTERS` in `src/linters/index.ts:18-33`.
3. Appropriate tags via `pillars`. Use `"all"` if you want it to pass
   every `--pillar` filter.
4. Choose `defaultSeverity`:
   - `error` — blocking, breaks CI. Reserve for strict invariants.
   - `warning` — nudges without blocking. Default for heuristics (drift,
     orphans, style).
5. Add a test in `src/linters/linters.test.ts` that builds a
   temporary repo and checks the expected issues.

## Debug

- **A linter does not run** — check that it is actually in `ALL_LINTERS`.
  Exporting it alone is not enough.
- **False positives on globbed paths** — `frontmatter-tracks` detects `*`
  via `pattern.includes("*")` (`src/linters/frontmatter-tracks.ts:10-14`).
  File names containing a literal `*` are impossible on sane
  filesystems, so the test is safe.
- **Inconsistent drift** — `gitCommitsSince` returns 0 if git is not
  initialized (silent try/catch). Running outside a git repo hides
  drift warnings.

## Pitfalls

- `listMarkdown` filters out `README.md` files (`src/linters/util.ts:20`). If you
  want to include them (e.g. for `readme-sections`), use `listAllMarkdown`
  or `readText` directly.
- The order in `ALL_LINTERS` determines the order of the displayed issues —
  useful for the readability of the text report.
- Linters run **sequentially**, not in parallel. The git helpers
  (`execSync`) justify it — no fork bomb.
