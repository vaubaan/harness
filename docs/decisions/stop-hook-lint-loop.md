# Self-healing lint loop via cross-engine Stop hooks

**Date:** 2026-06-01
**Status:** accepted (with an area of uncertainty — see _To accept_)
**Author:** Vaubaan core

> **CAR removal (2026-09-20, 1.1.1)**: the documentation check and
> in-session continuation remain active. The hook no longer emits a signal
> to CAR, an abandoned runtime; the mentions of an external supervisor
> below describe the historical context and promise no current
> service. See [the removal ADR](./retire-coding-agent-runner-coupling.md)
> and [the hooks handbook](../handbook/stop-hook.md).

> **v0.6.1 iteration (2026-06-01)**: the initial design injected the
> `/harness-lint` slash command into the session, which invoked a
> `harness-linter` skill in charge of fixing in a loop. That skill
> mixed LLM orchestration and lint triggering — an anti-pattern with
> respect to the linters/skill separation set by
> [_linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md).
> Refactor: the hook **itself runs** `vaubaan-harness lint`
> (pure function) and **directly injects the linter output** —
> enriched with per-error skill suggestions (`→ Try: /decision`,
> `→ Try: /readme`, …). The agent receives the raw report and decides what
> to invoke (or nothing). The `harness-linter` skill and the
> `/harness-lint` command were deleted. The anti-loop logic (3 layers)
> is unchanged — only what gets injected changes.

> **1.0.0 update (2026-09-20)**: the Codex and OpenCode hook schemas
> described below were corrected after verification against the CLIs —
> see [_engine-native-layouts-1-0_](./engine-native-layouts-1-0.md). The loop
> and anti-loop logic is unchanged.

## Context

The harness's 13 mechanical linters are **tech-agnostic** (they read
markdown + frontmatter, never application code) and run through
a single binary `vaubaan-harness lint` shipped in the package.
No application install to orchestrate (see
[ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md)) —
the only unsolved problem was: **when and how is this binary
invoked?**

Pre-decision state: manual invocation (`npx vaubaan-harness lint`)
or in a CI job the consumer writes themselves. Symptom: most
agent sessions end with a worktree that was never
linted, and it is the human or the PR review that discovers doc
pillar drifts too late.

Four dimensions to settle:

1. **When should the linter run?** — on every commit, at the end of
   every agent turn, on every session, in CI only.
2. **Who triggers it?** — the human, the agent (via an AGENTS.md
   instruction), a git hook, an engine hook, a CI job.
3. **What does the harness do when lint fails?** — block, warn,
   or let the agent fix it.
4. **How to avoid modifying the consumer's `package.json` /
   `.gitignore`?** — historical invariant
   ([see _multi-engine-pivot-format_](./multi-engine-pivot-format.md)):
   content rendered by the harness is **gitignored**.

## Decision

**In-session Stop-hook injecting `/harness-lint` into the current
session.** Each engine fires a `Stop` event when the agent finishes
its turn; the harness renders a per-engine hook config that calls
`vaubaan-harness stop-hook --engine <engine>`. This binary decides
whether a lint cycle should be restarted, and if so uses
the engine's native channel to **inject `/harness-lint` as the
next user prompt** into the conversation. The agent sees the linter
output, fixes the issues, ends the turn, and the hook re-fires
to verify — a bounded, **self-healing** loop.

### Anti-loop (3 cumulative layers, all portable)

1. **Runtime kill switch** `HARNESS_LINT_DISABLE=1` — the hook
   passes through immediately. Lets a consumer disable it without
   re-`init`.
2. **Built-in `stop_hook_active` flag** (Claude / Codex) — when
   present and `true`, the hook passes through. Engine-side guarantee
   that we are not already in a forced continuation. **Unavailable on
   opencode** — layer 3 carries the entire defense for that engine.
3. **Portable shell-only logic**:
   - **Dirty-git gate**: a non-empty `git status --porcelain` is the
     precondition for injecting. Otherwise → passthrough + reset state.
   - **Attempt counter** persisted in
     `.harness/state/lint-${sessionId}.json`. Max 3 by default,
     overridable via `HARNESS_LINT_MAX_ATTEMPTS`. Terminate when
     exceeded.
   - **No-progress guard**: if the `git status` hash is identical
     to that of the previous attempt, the agent changed nothing →
     terminate (avoids ping-pong where the agent retries an identical patch).

### Rendered surface per engine

| Engine        | Rendered file                                       | Response protocol                          |
|---------------|-----------------------------------------------------|--------------------------------------------|
| `claude-code` | `.claude/settings.json`                             | JSON `{decision: "block", reason}` stdout  |
| `codex-cli`   | `.codex/hooks.json`                                 | JSON `{decision: "block", reason}` stdout  |
| `opencode`    | `.opencode/plugins/harness-stop-hook/index.ts`      | exit code 2 + prompt on stderr             |

The `vaubaan-harness stop-hook` binary is shared by all three — only
the **adapters** parse the input payload and format the response
according to the engine's protocol. The anti-loop logic (`src/stop-hook/core.ts`)
is strictly engine-agnostic.

### Slash command + skill

A minimal binding:

- **`harness-linter` skill** (rendered on all 3 engines): describes the
  run-parse-fix-end-turn workflow and lists the canonical fixes
  per linter (readme-presence → create README, decision-schema →
  complete the 4 required sections, etc.).
- **`/harness-lint` command** (rendered on all 3 engines): trivial
  `slash → skill` binding.

This skill/command indirection is deliberate so that `/harness-lint`
can also be invoked **manually** by the human or by the agent
outside the hook context — not only by the automatic hook.

### Enriched manifest (v4)

`.harness-manifest.json` gains two optional fields:
`stopHookInstalled: bool` + `stopHookEngines: string[]`. The
**external Supervisor** (a Vaubaan process outside the session, out of
scope for this ADR but see _Consequences_) can thus know whether the
session it audits ran with or without the active hook safety net.

### Installation toggle

`vaubaan-harness init --no-stop-hook` skips the 3 hook config
files. Enabled by default — it is an opt-out, not an opt-in
(symmetrical to the MCP decision, which was opt-in, because the hook
safety net has no external non-Vaubaan dependency).

## Consequences

**Beneficial**:

- Lint becomes **systematic without human configuration**: every agent
  commit goes through the loop before the session can really
  end. No more "agent says OK, but the doc is broken" sessions.
- **Cross-engine by construction**: a single binary, three thin
  adapters. All 3 engines get the same behavior, up to the
  response protocol.
- **Self-healing within the session**: the agent sees the linter output
  in the conversation and can fix it, rather than surfacing
  the error to the human. The hook closes the loop before the human.
- **`harness gitignored` invariant preserved**: no file emitted
  outside the already gitignored directories (`.claude/`, `.codex/`,
  `.opencode/`, `.harness/`). No modification of the consumer's
  `package.json`, no script to add.
- **Decoupled from the external Supervisor**: the hook handles the
  in-session loop; the external Vaubaan Supervisor does its
  post-mortem audit based on the manifest and the transcript. The two
  roles are orthogonal and complementary.

**To accept**:

- **Area of uncertainty — hook schemas not verified against live
  CLIs** (partially resolved 2026-06-01). At the time of initial
  writing, the schemas of the 3 config files were derived from the
  official documentation but not smoke-tested. The `stop-hook`
  binary and the anti-loop logic were not concerned — only
  the rendered shells. Validation status:
   - **`.claude/settings.json`: ✅ validated live against Claude Code
     v2.1.143 (2026-06-01).** `stream-json` trace: `hook_started` →
     `hook_response` with our `{decision: "block", reason}` JSON →
     Claude injects the `reason` word for word as the next
     user message (prefixed `Stop hook feedback:`). The second Stop fires
     `stop_hook_active: true` in the payload → our anti-loop layer 2
     cuts in → the session ends cleanly. The
     `hooks.Stop[].matcher` + `hooks.Stop[].hooks[].type === "command"`
     structure is confirmed as the expected shape.
   - **`.codex/hooks.json`: not verified live.** The shape
     `{hooks: {Stop: [{type: "command", command}]}}` is plausible (and
     symmetrical to Claude Code, which shares the same protocol
     family according to OpenAI sources). To be smoke-tested against
     `codex-cli` 0.130+ when a dev has the binary at hand.
   - **`.opencode/plugins/harness-stop-hook/index.ts`: not verified
     live.** opencode's auto-discovery of TS plugins under
     `.opencode/plugins/<x>/index.ts` and the shape `export default
     {hooks: {stop: async (ctx) => ...}}` are plausible according to the
     plugins doc, to be smoke-tested against `opencode` 1.14+.
- **opencode = secondary defense missing.** No
  `stop_hook_active` on the opencode side → we rely only on the dirty gate
  + counter + no-progress. Combined, this is robust, but if one of these
  three cases is mishandled in a future version, opencode loops
  more easily than the other 2. To monitor.
- **Manifest v3 → v4 breaking.** zod-strict `readManifest` rejects a
  v3 manifest (`version: "3"`) — a pre-v0.6 project that upgrades the
  harness must re-`init`. Acceptable because the manifest is
  gitignored and rebuilt on every install.
- **Added latency per turn.** A cold `npx -y @vaubaan/harness
  stop-hook` (empty npx cache) costs ~1-2s per Stop event. On
  a Vaubaan VPS where the npx cache is persistent, it is negligible
  (~100ms). No preview possible for ephemeral environments
  such as CI; but the hook is not used in CI (option
  `--no-stop-hook` or `HARNESS_LINT_DISABLE=1`).
- **`/harness-lint` ↔ hook coupling.** The slash command is a
  shared contract: if `/harness-lint` is renamed one day, the hook
  must follow. Hard-coded in `INJECT_REASON` (`src/stop-hook/types.ts`)
  and in the rendered cmd. Acceptable symmetry, vigilance during a
  rename.

## Rejected alternatives

- **Raw git hook `.git/hooks/pre-commit`** — rejected after analysis.
  Pros: cross-engine by construction (it is git), hits
  the human as well as the agent. Cons: 1) blocks only
  at commit, not at end-of-turn — an agent that does not commit
  slips through; 2) provides no channel to re-inject the
  output into the conversation — the human must reread stderr and
  re-prompt. The conversational loop is lost. The in-session
  Stop-hook keeps the loop.
- **husky hook (`.husky/pre-commit`)** — rejected: husky requires
  a `husky` devDep + a committed `.husky/` directory. Breaks
  the "harness gitignored" invariant. And the benefit over the
  raw git hook is marginal (an abstraction layer over install,
  nothing on semantics).
- **CI-only (`vaubaan-harness lint` in a GH Actions job rendered
  by the harness)** — rejected: 1) the harness does not modify the
  consumer's CI (same gitignored invariant — `.github/workflows/`
  is committed), 2) feedback loop too late (drift is only seen
  at the PR, after the agent has run). Can be combined with the hook
  but does not replace it.
- **Application install of `biome` / `ruff` / `golangci-lint` per
  detected stack** — rejected for this ADR. It is a separate
  decision (and probably an opt-in) that does not concern the
  harness's mechanical linters. Follows a different logic
  (modifying the consumer's `package.json`, external dependency, etc.).
- **`lint-on-save` skill invoked by the agent via an AGENTS.md
  instruction** — rejected: relying on "the agent must remember to
  invoke the skill" is exactly the problem we want to
  solve. Not systematic.
- **External Vaubaan Supervisor process triggering lint at
  session exit** — rejected as a replacement. The external Supervisor
  **exists** and has its own role (post-mortem audit, merge decision,
  re-spawn) but it operates **after** the session has ended. The
  Stop-hook closes the loop **within** the session — the agent sees and
  fixes. The two are **complementary**, not substitutable.
  The ADR keeps the Stop-hook; the Supervisor stays out of scope.

## References

- [ADR _linters-mechanical-vs-skills_](./linters-mechanical-vs-skills.md) —
  sets the separation between mechanical linters (CI gates) and LLM skills
  (judgment) that makes the `vaubaan-harness lint` binary tech-agnostic.
- [ADR _multi-engine-pivot-format_](./multi-engine-pivot-format.md) —
  per-engine renderers share a common signature; we extend
  the interface with `renderStopHook()`, following the same mechanism
  as `renderMcp`.
- [ADR _mcp-rendering-opt-in_](./mcp-rendering-opt-in.md) — earlier
  case study for rendering an engine-native config file
  (inverse analogue: MCP is opt-in, stop-hook is opt-out).
- [ADR _capabilities-matrix-with-degradation_](./capabilities-matrix-with-degradation.md) —
  the `harness-linter` skill requires `multi-step` + `inline-exec`;
  codex-cli degrades `multi-step` but remains functional.
- [Claude Code Hooks](https://docs.claude.com/en/docs/claude-code/hooks)
  (official documentation source for the `.claude/settings.json` schema).
- [Codex CLI Hooks](https://developers.openai.com/codex/hooks)
  (official documentation source for the `.codex/hooks.json` schema).
- [opencode Plugins](https://opencode.ai/docs/plugins/)
  (official documentation source for the TS plugin shape).
