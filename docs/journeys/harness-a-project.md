---
title: Harness a project
status: implemented
actors: [maintainer]
spec: ../spec/coding-agent-harness.md
last_reviewed: 2026-11-09
---

# Harness a project

As a maintainer, I want my agents to share one context for the project so
that none of them works from stale or private instructions.

## Render the harness into the project

requires: engine
creates: generated-file, manifest
anchors: src/cli/init.ts, src/cli/plan-render.ts, src/render.ts, tests/integration/init.test.ts
spec: ../spec/coding-agent-harness.md#8-composition-umbrella--skills--commands

## Keep the render current

### Update to the installed version

requires: manifest
creates: generated-file
anchors: src/cli/update.ts, src/cli/update-transaction.ts, tests/integration/update.test.ts
spec: ../spec/coding-agent-harness.md#updating-an-existing-installation

### Keep a generated file as the project's

requires: manifest, generated-file
creates: preserved-file
anchors: src/cli/managed-paths.ts, src/cli/update-manifest.ts, tests/integration/init-safe.test.ts

### Change the engines

requires: manifest, engine
creates: generated-file
anchors: src/cli/init.ts, tests/integration/init.test.ts

## Try a skill before proposing it upstream

requires: override, manifest
creates: generated-file
anchors: src/loader.ts, src/render.ts, tests/integration/update.test.ts
spec: ../spec/coding-agent-harness.md#11-gitignored-overrides

## Version the team's own skills with the project

requires: skill
creates: generated-file
anchors: src/loader.ts, src/cli/plan-render.ts
spec: ../spec/coding-agent-harness.md#912-optional-pillars

## Back out of the harness

requires: manifest
anchors: src/cli/uninstall.ts, tests/integration/uninstall.test.ts
