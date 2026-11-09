---
title: Keep the docs honest
status: implemented
actors: [maintainer, coding-agent]
spec: ../spec/coding-agent-harness.md
last_reviewed: 2026-11-09
---

# Keep the docs honest

As a maintainer, I want a pull request to fail when the context no longer
matches the code, so that an agent never works from a stale doc.

## Lint the context before a commit

As a coding agent, I see a failed command in my own flow, at zero token cost.

### Check the shape of each pillar

requires: doc
anchors: src/linters/doc-layout.ts, src/linters/cardinal-files.ts, src/linters/readme-presence.ts, src/linters/readme-sections.ts, src/linters/decision-schema.ts, src/linters/quality-schema.ts, src/linters/spec-has-content.ts, src/linters/spec-tech-agnostic.ts
spec: ../spec/coding-agent-harness.md#102-mechanical-linters-ci-gates

### Check that every pointer resolves

requires: doc
anchors: src/linters/frontmatter-tracks.ts, src/linters/cross-links.ts, src/linters/orphan-decisions.ts, src/linters/adr-no-tracks.ts

### Warn when the code moves and the doc does not

requires: doc
anchors: src/linters/tracks-drift.ts

### Fail when a generated file no longer matches its render

requires: manifest, generated-file
anchors: src/linters/generated-fresh.ts, src/linters/gitignore-harness.ts, tests/integration/generated-fresh.test.ts
spec: ../spec/coding-agent-harness.md#33-in-the-project-repo-what-persists-vs-gitignored

## Fill a gap in the context

requires: doc
creates: doc
anchors: src/skills/spec-writer.skill.md, src/skills/decision-record-writer.skill.md, src/skills/handbook-writer.skill.md, src/skills/test-plan-writer.skill.md, src/skills/workflow-writer.skill.md, src/skills/readme-writer.skill.md, src/commands/*.cmd.md
spec: ../spec/coding-agent-harness.md#71-doc-skills

## Audit what the linters cannot judge

requires: doc
anchors: src/skills/doc-audit.skill.md, src/skills/drift-detector.skill.md
spec: ../spec/coding-agent-harness.md#101-doc-audit-skill

## Rewrite a context that has grown contradictions

status: proposed
requires: doc
creates: doc
acceptance:
- `/compact` lists the contradictions between pillars before rewriting anything.
- A rewritten file keeps every rule in force and drops only what another pillar already says.
