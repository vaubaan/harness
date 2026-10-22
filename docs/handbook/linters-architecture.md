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
  - src/linters/generated-fresh.ts
  - src/linters/orphan-decisions.ts
  - src/linters/quality-schema.ts
  - src/cli/index.ts
  - src/cli/check.ts
last_reviewed: 2026-10-22
---

# Linters architecture

The 15 mechanical linters that keep the documentation of a harnessed repo
consistent. They all follow the same pattern, are composable and run as
pure functions from `src/linters/`. They are the only automated check the
harness provides: they run in CI and, if the project wires them, in a git
pre-commit hook. No engine hook runs them
([lint in CI and pre-commit](../decisions/lint-in-ci-and-pre-commit.md)).

## The shared interface

`src/linters/types.ts`:

```ts
export interface Linter {
  id: string;                            // ex "lint:readme-presence"
  pillars: ReadonlyArray<string>;        // ex ["handbook", "tests"]
  defaultSeverity: Severity;             // "error" | "warning"
  suggestedSkills?: ReadonlyArray<string>;
  run(repoRoot: string, ctx?: LintContext): LintIssue[];
}
```

A `LintIssue` carries `{ linter, severity, file, line?, message }`.

The contract is **stateless** and **pure**: no linter mutates the disk;
each call builds its issues from a read-only view of the repo.
This is what makes it possible to test each linter individually
(`src/linters/linters.test.ts`).

## The 15 linters

All registered in `ALL_LINTERS` (`src/linters/index.ts`), in
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
| `generated-fresh`           | `repo-root`                      | error    |

`quality-schema` is the only linter attached to an **optional** pillar:
it reports nothing as long as `docs/quality/` does not exist (see
[quality pillar](./quality-pillar.md)). `generated-fresh` reports
nothing as long as the repo has no `.harness-manifest.json`.

## The aggregator

`runLinters(repoRoot, opts)` (`src/linters/index.ts`):

1. **Filters** the `ALL_LINTERS` list by `opts.only` (whitelist by id) or
   `opts.pillar` (a linter passes if one of its `pillars` matches, or if it
   declares the `"all"` pseudo-pillar).
2. **Runs** each linter in a `try/catch` — an internal crash becomes
   a `severity: "error"` issue on `<internal>`, and the rest continues.
3. **Aggregates** the counters: `pass = (errors === 0)`. Warnings
   do **not** affect `pass`.

The final report is a versioned `LintReport` (`version: 1`,
`src/linters/types.ts`):

```ts
{ version: 1, summary: { errors, warnings, pass }, issues: [...] }
```

## The CLI

`vaubaan-harness lint` in `src/cli/index.ts`:

- `--pillar <pillar>` — filter by pillar
- `--only <ids>` — comma-separated linter ids, run those only (the
  `drift-detector` skill uses it as a pre-flight)
- `--format text|json` — `text` (default) prints the report via
  `formatReportText` (`src/linters/index.ts`), with the suggested skill of
  each issue; `json` dumps the raw report. The JSON is versioned by
  `version: 1`: a consumer can rely on it.
- `--cwd <dir>` — root of the audited repo (default `.`)
- **Exit code**: `0` iff `summary.pass`. So warnings → exit 0, errors → exit 1.

Where to run it: in CI on every pull request, and locally in a git
pre-commit hook (`npx @vaubaan/harness lint`). The rendered `AGENTS.md`
tells the agent to run it before committing.

## Linter examples

### Generated files and `.gitignore`

`src/linters/gitignore-harness.ts` keeps two lists:

- `REQUIRED_GITIGNORE_ENTRIES`: `.harness-overrides/` and `.vaubaan/`.
  Local, disposable state (personal overrides, skill reports) never
  belongs in Git.
- `FORBIDDEN_GITIGNORE_ENTRIES`: `AGENTS.md`, `CLAUDE.md`, `.claude/`,
  `.codex/`, `.agents/`, `.opencode/`, `.harness-manifest.json`. The
  files the harness generates are **committed**, so a clone has the
  whole context without the harness installed
  ([generated files committed](../decisions/generated-files-committed.md)).
  Ignoring one of them is an error.

`gitignoreEntries` normalizes each line: comments and blanks are
dropped, a leading `/` and a trailing `/` are removed, so `.claude`,
`.claude/` and `/.claude/` all match. `missingGitignoreEntries` and
`forbiddenGitignoreEntries` are shared with the `check` layout check
(`src/cli/check.ts`), which also checks the documentation pillars.

Since 2.0 neither check requires `.harness/` (the Stop hook state
directory no longer exists) nor `.mcp.json` (the harness no longer
writes it). Since 1.1.1 neither requires `.car/`.

### Rendered files are current — `generated-fresh`

`src/linters/generated-fresh.ts` is what keeps the committed generated
files honest:

1. Reads `.harness-manifest.json` (`readManifest`, `src/cli/manifest.ts`).
   No manifest → no issue: the repo is not harnessed. An invalid
   manifest → one error.
2. Re-renders the harness with `planInit` (`src/cli/plan-render.ts`),
   using the engines recorded in the manifest, the overrides parent it
   records (or the repo root when a `.harness-overrides/` exists there),
   the project skills under `docs/skills/` and the quality pillar. A
   render failure (unknown engine, malformed override) → one error.
3. Compares every rendered file with the working tree: a missing file
   or a differing content is an error. Files listed in
   `preservedFiles` are skipped.
4. Reports as stale any file the manifest lists that is no longer
   rendered and still exists, except the paths 1.x released
   (`RELEASED_PATHS`, `src/cli/managed-paths.ts`).

Every message ends with the fix: `npx @vaubaan/harness update .`, then
commit. The render uses the content of the package that runs the lint,
so CI must run the same harness version as the developer: pin it as a
devDependency.

### File existence — `readme-presence`

The simplest one (`src/linters/readme-presence.ts`): checks that
`README.md` exists at the root via `fileExists` (`src/linters/util.ts`). One
issue or zero. Serves as a minimal template for the other "presence" linters (see
`cardinal-files.ts`).

### Markdown sections — `decision-schema`

`src/linters/decision-schema.ts` declares 4 regexes for the required sections
of ADRs (`## Context`, `## Decision`, `## Consequences`,
`## Rejected alternatives`) then iterates via `listMarkdown(repoRoot, "docs/decisions")`
(`src/linters/util.ts`). `listMarkdown` skips `README.md` files —
*important*: the README of a pillar directory is never linted for
its content (but it is required elsewhere, by `readme-sections`).

### Frontmatter + path existence — `frontmatter-tracks`

`src/linters/frontmatter-tracks.ts` walks `docs/handbook/`, `docs/tests/`,
`docs/workflow/` (`TRACKED_DIRS`).
For each markdown file it:

1. Extracts the frontmatter via `parseFrontmatter` (`src/linters/util.ts`,
   a wrapper around `gray-matter`).
2. Checks that a `tracks: [...]` array exists.
3. For each string entry, calls `trackedPathExists` — if the string
   contains `*`, expansion via `fast-glob`, otherwise `existsSync`.

This linter is the reason for this very file's frontmatter.

### Drift via git log — `tracks-drift`

`src/linters/tracks-drift.ts` cross-references two things:

- `gitLastCommitForPath(repoRoot, docFile)` (`src/linters/util.ts`) —
  date of the last commit that touched the doc, via
  `git log -1 --format=%H:%ct`.
- `gitCommitsSince(repoRoot, codeFile, sinceCommit)` (`src/linters/util.ts`) —
  number of commits that touched the tracked file since that date.

Beyond `DEFAULT_DRIFT_THRESHOLD = 10` (`src/linters/tracks-drift.ts`),
warning. It is the incentive to update the handbook when the implementation
changes — it **never breaks CI** (severity `warning`).

Each doc can override this threshold with `driftThreshold: <n>` in its
frontmatter. Useful for critical handbooks that must be updated sooner.

## How to write a new linter

1. Create `src/linters/<id>.ts`. Export an object conforming to `Linter`. Reuse
   the helpers from `src/linters/util.ts` for reading (`fileExists`,
   `readText`, `listMarkdown`, `parseFrontmatter`, git helpers).
2. Add it to `ALL_LINTERS` in `src/linters/index.ts`.
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
  via `pattern.includes("*")`.
  File names containing a literal `*` are impossible on sane
  filesystems, so the test is safe.
- **Inconsistent drift** — `gitCommitsSince` returns 0 if git is not
  initialized (silent try/catch). Running outside a git repo hides
  drift warnings.
- **`generated-fresh` fails right after `npm i -D @vaubaan/harness@latest`**
  — expected: the new version renders differently. Run `update .` and
  commit.

## Pitfalls

- `listMarkdown` filters out `README.md` files. If you
  want to include them (e.g. for `readme-sections`), use `listAllMarkdown`
  or `readText` directly.
- The order in `ALL_LINTERS` determines the order of the displayed issues —
  useful for the readability of the text report.
- Linters run **sequentially**, not in parallel. The git helpers
  (`execFileSync`) justify it — no fork bomb.
- `generated-fresh` is the one linter that loads the harness content:
  `dist/linters/index.js` bundles `planInit` and locates `skills/` by
  walking up from its own location (see
  [CLI package resolution](./cli-package-resolution.md)).
