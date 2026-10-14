---
status: deprecated
date: 2026-06-04
superseded_by: retire-coding-agent-runner-coupling
---

# Design of supervisor support in the harness

**Date:** 2026-06-04
**Status:** proposal withdrawn on 2026-09-20
**Author:** Vaubaan core

> **Withdrawal (2026-09-20)**: CAR (`coding-agent-runner`) is abandoned.
> This text preserves a historical proposal, never implemented in
> the package: no `./supervisor` export, `supervisor` subcommand,
> `TasksEntry` schema or set of five supervisor linters is shipped.
> The CAR conventions, API and functions described below therefore
> do not constitute a usable contract. See
> [the removal of CAR couplings](./retire-coding-agent-runner-coupling.md).

## Context

The harness was designed for **coding agents**: in-session Stop hook,
tmux glue, redaction, mechanical linters on the 6 doc pillars. The
self-healing loop described in
[ADR _stop-hook-lint-loop_](./stop-hook-lint-loop.md) closes the loop
*inside* a coding session.

Vaubaan now has a **supervisor** role whose lifecycle and
responsibilities are radically different:

- **It does not write code.** Its output is coordination:
  spawning sessions, reading PRs, merging or archiving, maintaining
  a backlog.
- **Long cycle.** A coding session lasts a few hours; a
  supervisor runs for days or weeks.
- **Specific working files.** CAR convention: `tasks.md`
  (backlog, statuses), `engine-home/` (engine state), goal encoded
  in `$CAR_GOAL`. The harness currently ignores all of this.
- **No useful Stop hook.** The in-session hook is calibrated to
  inject a lint report at the end of an agent turn; for a supervisor,
  the turn is of a different nature and the notion of a "dirty worktree"
  makes no sense.

The harness serves supervisors today **by accident, not by
design**. This ADR explores what intentional supervisor support
must provide, in four questions.

The alternatives to the _coding Plan A_ set by
[ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md)
(mechanical linters as CI gate, LLM skill in session) also apply
to the supervisor — with different source data.

## Decision

### Q1 — Working files: harness schema or free convention?

**Decision: light standardization.** The harness provides a Zod schema
for a `tasks.md` entry (validation `validateTasksEntry`), but
**does not take ownership of the file's location** — the CAR convention
sets it (`/project/tasks.md`). Two reasons:

1. Imposing a path from the harness creates a harness ↔ CAR coupling
   that is hard to evolve independently.
2. The value of the schema is **validatability**: a
   `supervisor lint` command can check that entries are structured
   (`status`, `session_id`, `rationale` fields present and typed), which
   no generic tool does today.

Minimal structure of a validated `tasks.md` entry:

```typescript
// Zod schema — exported from ./supervisor
const TasksEntrySchema = z.object({
  id:         z.string(),
  status:     z.enum(["todo", "in_progress", "done", "blocked", "archived"]),
  session_id: z.string().optional(),   // ref CAR session
  rationale:  z.string().optional(),
  created_at: z.string().datetime().optional(),
});
```

**Supervisor `goals.yaml` and `decision-log`**: `[needs-operator]`.
Whether the supervisor's goal should be versioned in a YAML file or
whether `$CAR_GOAL` is enough remains
open — likewise for a structured decision log. These two
artifacts do not block the launch of the `./supervisor`
export; they can be added in a later version if Renaud
confirms the complexity is justified.

### Q2 — Git for supervisor decisions?

**No.** Do not create a git repo dedicated to supervisor decisions.

Argument: the **CAR journal** (`journal.jsonl`) and the conversation
archive already form the audit trail — each event is
timestamped, tied to a session, append-only. Adding a git repo
introduces:

- write friction (every supervisor action triggers a
  commit, with conflict handling if two supervisors share the
  same repo);
- a CAR ↔ git synchronization to maintain;
- a git dependency in a context where the supervisor directory
  may be ephemeral.

**Chosen alternative: structured append-only log** `.supervisor/log.md`,
written by a harness helper (`appendSupervisorLog`) on each major
event:

- goal received (`goal_received`)
- session spawned (`session_spawned`, with `session_id`)
- PR merged (`pr_merged`, with `pr_url`, `session_id`)
- session archived (`session_archived`)
- escalation raised (`escalation`, with reason)

Format: one Markdown line per event, ISO 8601 timestamped,
no frontmatter. Human-readable, mechanically parseable by
`supervisor lint`. Gitignored (like all `.supervisor/` files).

### Q3 — Drift equivalents for the supervisor

The coding harness has doc drift detectors. The supervisor has its
own drifts. We define five, each expressed as a
`Linter`-compatible linter (same interface as the existing mechanical
linters: `(repoRoot) → LintIssue[]`).

#### 1. Backlog drift

**Definition:** a `tasks.md` entry with `status: "in_progress"` whose
associated session (`session_id`) is archived or not found on the
CAR side.

**Source data:** `tasks.md` + `GET /v1/sessions/<session_id>`
(CAR API, env variables `$CAR_API_URL` + `$CAR_API_TOKEN`).

**Frequency:** on demand (`supervisor lint`); no cron —
the network call disqualifies this linter for the synchronous CI gate.

**Surface:** `formatReportText` report, same pattern as the coding
linters. Severity `warning` if the session has been archived for < 1h,
`error` beyond that.

#### 2. Mission drift

**Definition:** the backlog extends beyond the initial goal encoded
in `$CAR_GOAL` (uncontrolled growth, out-of-scope tasks).

**Source data:** `tasks.md` + `$CAR_GOAL`.

**Detection:** dual heuristic — (a) size threshold: > N entries
not `done`/`archived` (configurable, default 20) raises a `warning`;
(b) semantic distance between task title and goal: `[needs-operator]` —
full mechanization requires an LLM call, which falls outside the scope
of CI-gate linters. The size threshold is the only mechanizable
check.

**Surface:** `warning` with count + suggestion to invoke `/doc-audit`
for the semantic judgment.

#### 3. Coordination drift

**Definition:** an active coding session has not produced a new
`journal.jsonl` entry for > 30 min, with no corresponding update in
`tasks.md`.

**Source data:** the session's `journal.jsonl` (timestamp of last
event) + `tasks.md` (last modification date of the linked entry).

**Frequency:** on demand or 15-min cron (configurable via
`SUPERVISOR_COORDINATION_INTERVAL`).

**Surface:** `error` with `session_id` + idle duration + PR url
if available.

#### 4. Decision drift

**Definition:** the supervisor merged a PR while CI check runs
were failing — a violation of a hard rule.

**Source data:** `GET /repos/{owner}/{repo}/commits/{sha}/check-runs`
(GitHub API) + `.supervisor/log.md` log (`pr_merged` events).

**Nature:** **retrospective** check — not real-time. Will run after
each merge recorded in the log.

**Surface:** `error` with `pr_url`, `sha`, list of failing checks.
Maximum severity: this case constitutes a breach of an operational rule.

#### 5. Visibility drift

**Definition:** a session was spawned > N turns ago (default:
5) without any mention of its `session_id` in `tasks.md`.

**Source data:** `GET /v1/sessions` (CAR API, list of active
sessions) + `tasks.md` (search for referenced `session_id`s).

**Frequency:** on demand (`supervisor lint`).

**Surface:** `warning` with the missing `session_id` + suggestion
to archive or add an entry.

---

The five linters share the `Linter` interface and integrate
naturally into `formatReportText` — the human or the supervisor
agent receives a uniform report, same look as the coding lint.

### Q4 — One package or two?

**Option C chosen: same package, `./supervisor` subpath.**

```typescript
// Coding import (existing)
import { linters } from '@vaubaan/harness/linters';

// Supervisor import (new)
import {
  supervisorLinters,
  validateTasksEntry,
} from '@vaubaan/harness/supervisor';
```

Motivations:

- **Unified version cadence**: coding and supervisor evolve in
  the same package — one bump, one changelog, one `npm publish`.
- **Clean separation without scattering**: the `./supervisor` export is
  isolated from the rest — no supervisor code is unintentionally imported
  by a coding-only project.
- **No new package to publish**: `@vaubaan/harness-supervisor`
  would have its own CI pipeline, its own peer deps management, and its
  own `npm publish` — overhead with no real gain at this stage.

**Contents of the `./supervisor` export**:

- `supervisorLinters`: array of the 5 linters defined in Q3, each
  implementing the `Linter` interface.
- `validateTasksEntry(raw: unknown)`: parses and validates a raw entry
  via the Zod schema from Q1. Throws a typed `ZodError` on failure.
- `appendSupervisorLog(repoRoot, event)`: helper to write to
  `.supervisor/log.md` (see Q2).

**CLI:** new subcommand `vaubaan-harness supervisor lint
--project-dir <path>` that runs the 5 `supervisorLinters` and emits
the `formatReportText` report. Identical to `vaubaan-harness lint` for
the coding linters — same output, same format, same exit code.

## Consequences

**Beneficial:**

- The supervisor finally has a safety net **equivalent to the
  coding lint** — five classes of mechanically detectable drift,
  surfaced in a uniform report.
- **Zod `tasks.md` schema** = contract between CAR and the harness. Any
  change to the `tasks.md` format is visible in the harness code,
  not only in the unenforced CAR convention.
- **No architectural coupling**: the `./supervisor` export is opt-in
  for consumers; a coding-only project imports nothing from the
  supervisor subpath.
- **Minimal `.supervisor/log.md` log**: audit trail without git friction,
  human-readable, parseable by the linters.

**To accept:**

- **Supervisor linters have network dependencies** (CAR API,
  GitHub API). They cannot be synchronous CI gates like
  the 11 coding linters — they are exclusively `on-demand` or cron.
  The `README` of the `./supervisor` subpath must document this
  explicitly to avoid any confusion.
- **Mission drift is partially mechanical.** The size threshold is
  an imperfect proxy for semantic consistency. A backlog of 25
  entries perfectly aligned with the goal is less problematic
  than a backlog of 10 out-of-scope entries. `[needs-operator]` for the
  LLM part.
- **`goals.yaml` and decision-log remain undecided** `[needs-operator]`.
  The v1 `./supervisor` export can ship without them; but the lack of a
  decision creates a gap that operators will fill ad hoc.
- **Stop hook not applicable to the supervisor.** The
  [_stop-hook-lint-loop_](./stop-hook-lint-loop.md) mechanism is not
  relevant for the supervisor role (no dirty worktree, no
  in-session self-healing loop). `vaubaan-harness init` must not
  drop the hook files into a supervisor directory — a
  `--role=supervisor` flag (or detection of `CAR_ROLE=supervisor`) should
  skip the hook installation.

## Rejected alternatives

- **Separate package `@vaubaan/harness-supervisor`** — rejected. Same
  version cadence, same publishing infrastructure, same test
  suite. A separate package brings only scattering at this stage.
  To be reconsidered if the volume of supervisor code becomes disproportionate
  (> 30% of the total package).

- **Conditional `CAR_ROLE=supervisor` branches in the existing
  code** — rejected. Using an env variable to branch internal
  logic is a readability anti-pattern: a maintainer reading
  `src/linters/` cannot tell without grep that half the code is
  inert depending on the role. The `./supervisor` export is more explicit and
  more tree-shakeable.

- **Dedicated git repo for supervisor decisions** — rejected (see Q2).
  The CAR journal is the source of truth; a parallel git repo creates
  fragile redundancy.

- **Supervisor linters integrated into the `doc-audit` skill** — rejected.
  Same argument as in
  [ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md):
  mixing CI gate and LLM judgment removes the automatic enforcement
  property. The 4 fully mechanical linters (backlog, coordination,
  decision, visibility drift) are CI gates — they must stay
  outside LLM skills.

- **Do nothing — the supervisor gets by with existing tools**
  — rejected. A supervisor without a drift detection safety net operates
  blind; coordination drift or backlog drift incidents
  left > 24h are too costly to detect manually in a
  multi-session process.

## References

- [ADR _stop-hook-lint-loop_](./stop-hook-lint-loop.md) — sets the
  external Supervisor as out of scope and complementary to the in-session hook;
  this ADR is its direct follow-up.
- [ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md) —
  founding principle of the separation between CI-gate linters and LLM skill,
  reused here for the supervisor linters.
- [Harness spec §0 — Vocabulary](../spec/coding-agent-harness.md) —
  definition of the agent personas and of the harness scope.
