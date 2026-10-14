# 0006 — `CLAUDE.md` stub for claude-code back-compat

**Date:** 2026-05-21
**Status:** superseded — `superseded_by:` [engine-native-layouts-1-0](./engine-native-layouts-1-0.md)
**Author:** Vaubaan core

## Context

The modern cross-engine convention for an agent's main system
prompt is `AGENTS.md` — that is what codex-cli and
opencode read natively. Claude Code historically read `CLAUDE.md` at
the root of the current directory. Both conventions coexist in
the 2026 ecosystem, and many existing Claude Code configurations
(at users' and in our own legacy) still point
to `CLAUDE.md`.

The harness renders the agent (`coding.agent.md`, `review.agent.md`, etc.)
as **one** main system prompt file. The
claude-code renderer must decide what to write in the target directory.

## Decision

- **All renderers** emit `AGENTS.md` — single source of truth
  for the session's system prompt.
- **The claude-code renderer additionally emits `CLAUDE.md`**, whose content
  is a **redirect stub** (see `src/renderers/claude-code.ts`,
  constant `CLAUDE_MD_STUB`):

  ```markdown
  # Voir AGENTS.md

  Claude Code lit historiquement `CLAUDE.md`. Pour la cohérence cross-engine
  (claude-code / codex-cli / opencode), le système prompt principal vit dans
  [AGENTS.md](./AGENTS.md). Suis-le.
  ```

- The `codex-cli` and `opencode` renderers emit **only** `AGENTS.md`
  — they do not know the `CLAUDE.md` convention.

## Consequences

- **Back-compat**: a user / tool that still points to `CLAUDE.md`
  finds a file that redirects it. No silent breakage.
- **Single source of truth**: the real content lives in `AGENTS.md`; the
  stub is never to be edited.
- **No duplication**: we do not write the system prompt twice,
  which removes any possibility of drift between the two.
- **Readability of the target directory on the claude-code side**: two files
  at the root instead of one, but the stub is 5 lines — marginal
  visual cost.
- **Future migration**: if Claude Code ever drops `CLAUDE.md`,
  removing the stub = deleting 10 lines in one renderer.

## Rejected alternatives

- **`CLAUDE.md` alone, no `AGENTS.md`**: breaks the cross-engine
  convention and prevents codex-cli / opencode from reading their system
  prompt.
- **`AGENTS.md` alone, no stub**: regression for historical Claude Code
  configurations that assume `CLAUDE.md` is present.
- **Symlink `CLAUDE.md → AGENTS.md`**: Windows issues
  (filesystems without native symlink support), painful git
  readability, and some Markdown editors render it poorly.
- **Duplicated content between `AGENTS.md` and `CLAUDE.md`**: guaranteed drift
  from the first manual edit.
- **Same behavior (stub) for all three engines**: codex-cli and
  opencode have never read `CLAUDE.md`; the file would be useless noise
  under their root.

See [ADR _multi-engine-pivot-format_](./multi-engine-pivot-format.md) on the role of
renderers, and [spec §3.2](../spec/coding-agent-harness.md) on the
target directory layout.
