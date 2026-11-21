---
title: Know who the project serves
status: implemented
actors: [maintainer, coding-agent]
spec: ../spec/coding-agent-harness.md
last_reviewed: 2026-11-21
---

# Know who the project serves

As a maintainer, I want the users my project serves, what hurts them and
what they hope for, to sit next to the intents, so that every agent knows
for whom and why a change is made.

## Describe a profile with its pains and gains

creates: profile, pain, gain
anchors: src/parser/profile.ts, src/linters/profile-schema.ts, src/templates/profile.md.tmpl, src/skills/harn-intent-writer.skill.md, tests/integration/profiles.test.ts
spec: ../spec/coding-agent-harness.md#914-profiles

## Say which pain an intent relieves

requires: intent, profile, pain, gain
anchors: src/parser/intent.ts, src/linters/intent-profiles.ts, tests/integration/profiles.test.ts
spec: ../spec/coding-agent-harness.md#914-profiles

## Read the fit between the profiles and the intents

requires: profile, intent
creates: generated-file
anchors: src/renderers/profiles-index.ts, src/render.ts, tests/integration/profiles.test.ts
spec: ../spec/coding-agent-harness.md#914-profiles
