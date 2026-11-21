---
tracks: [.github/workflows/ci.yml, package.json, .husky/pre-commit]
---
# Coding workflow

## CI pipeline
`ci.yml`: typecheck, test, `vaubaan-harness lint`. Required to merge.

## PR process
Trunk-based, squash merge, one approval.

## Release
Tag `v*` triggers a publish.
