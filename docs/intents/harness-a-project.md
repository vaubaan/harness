---
title: Harness a project
status: implemented
actors: [maintainer]
spec: ../spec/coding-agent-harness.md
last_reviewed: 2026-11-21
---

# Harness a project

As a maintainer, I want my agents to share one context for the project so
that none of them works from stale or private instructions.

## Render the harness into the project

creates: generated-file, manifest
anchors: src/cli/init.ts, src/cli/plan-render.ts, src/render.ts, tests/integration/init.test.ts
spec: ../spec/coding-agent-harness.md#8-composition-umbrella--skills--commands

## Grow the context with the project

A project that just started is not asked for what it does not need yet.

### Start with a README alone

creates: generated-file, manifest
anchors: src/pillars.ts, src/linters/doc-layout.ts, src/linters/cardinal-files.ts, src/cli/check.ts, tests/integration/pillars.test.ts
spec: ../spec/coding-agent-harness.md#912-active-pillars

### Add a pillar the day the project needs it

requires: manifest
creates: pillar, generated-file
anchors: src/cli/add.ts, src/pillars.ts, src/render.ts, tests/integration/add.test.ts
spec: ../spec/coding-agent-harness.md#912-active-pillars

### Be told when a pillar is worth adding

requires: pillar
anchors: src/skills/harness-zero.skill.md, src/renderers/common.ts, tests/integration/pillars.test.ts
spec: ../spec/coding-agent-harness.md#72-harness-skills

## Keep the render current

### Update to the installed version

requires: manifest
creates: generated-file
anchors: src/cli/update.ts, src/cli/update-transaction.ts, tests/integration/update.test.ts
spec: ../spec/coding-agent-harness.md#updating-an-existing-installation

### Move to a newer harness version

requires: manifest
creates: generated-file
anchors: src/skills/harness-upgrade.skill.md, src/commands/harness-upgrade.cmd.md, tests/integration/harness-skills.test.ts
spec: ../spec/coding-agent-harness.md#72-harness-skills

### Keep a generated file as the project's

requires: manifest, generated-file
creates: preserved-file
anchors: src/cli/managed-paths.ts, src/cli/update-manifest.ts, tests/integration/init-safe.test.ts

### Change the engines

requires: manifest
creates: generated-file
anchors: src/cli/init.ts, tests/integration/init.test.ts

## Try a skill before proposing it upstream

requires: manifest
creates: generated-file
anchors: src/loader.ts, src/render.ts, tests/integration/update.test.ts
spec: ../spec/coding-agent-harness.md#11-gitignored-overrides

## Version the team's own skills with the project

creates: generated-file
anchors: src/loader.ts, src/cli/plan-render.ts
spec: ../spec/coding-agent-harness.md#912-optional-pillars

## Back out of the harness

requires: manifest
anchors: src/cli/uninstall.ts, tests/integration/uninstall.test.ts
