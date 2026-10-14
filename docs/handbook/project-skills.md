---
tracks:
  - src/loader.ts
  - src/render.ts
  - src/cli/init.ts
---

# Project skills (`docs/skills/`)

Project skills are domain-specific skills versioned with the project. They
live in `docs/skills/` and use the same `*.skill.md` format as built-in
skills.

## Creating a project skill

Create a file in `docs/skills/` with the `.skill.md` extension:

```markdown
---
id: new-plugin-guide
description: Step-by-step guide for implementing a new plugin.
tags: [onboarding, plugins]
---

# How to implement a new plugin

1. Create a new file in `src/plugins/`...
```

### Frontmatter schema

Identical to built-in skills (Zod strict validation):

| Field | Required | Description |
|---|---|---|
| `id` | yes | Kebab-case identifier (`[a-z][a-z0-9-]*`) |
| `description` | yes | One-line summary |
| `engines` | no | Restrict to specific engines (`claude-code`, `codex-cli`, `opencode`) |
| `requires` | no | Capability requirements (`multi-step`, `slash-command`, `inline-exec`) |
| `tags` | no | Free-form tags for categorisation |

## Discovery and merge order

At `init` time the harness scans `<target-dir>/docs/skills/*.skill.md`.
The merge order is:

```
stock (src/skills/) → project (docs/skills/) → overrides (.harness-overrides/)
```

- A project skill with the same `id` as a stock skill **replaces** it.
- Overrides (`disable.yaml`) can disable any skill, including project skills.
- If `docs/skills/` does not exist, `init` proceeds normally (optional pillar).

## Rendering

Project skills are rendered into every target engine alongside built-in
skills:

| Engine | Output path |
|---|---|
| claude-code | `.claude/skills/<id>/SKILL.md` |
| codex-cli | `.agents/skills/<id>/SKILL.md` |
| opencode | `.opencode/skills/<id>/SKILL.md` (omitted when another rendered engine already exposes the skill) |

They appear in the "Doc-skills" section of `AGENTS.md`.

## Limitations

- No slash-commands are auto-generated for project skills. They are
  invocable by the agent only (not via `/trigger`).
- The `docs/skills/` pillar is optional: the `doc-layout` linter does not
  require its existence.
