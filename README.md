# @vaubaan/harness

**Project conventions as code.**

Define once how your project is built — architecture, code quality, decisions, workflow. Claude Code, Codex and OpenCode follow it, and linters keep it honest.

Coding Agent Harness (CAH) — the Vaubaan subsystem that harnesses a project so that a coding agent (claude-code / codex-cli / opencode) is immediately productive in it, and that keeps a project's documentation alive (6 required pillars: README + spec + decisions + handbook + tests + workflow, plus two optional pillars: `docs/skills/` for the project's domain skills and `docs/quality/` for its code-quality rules).

## What is this

The CAH ships:

- A **pivot format** `*.skill.md` / `*.cmd.md` / `*.agent.md` that renders into the native layout of the 3 supported engines (claude-code, codex-cli, opencode).
- A **canonical set of doc-skills** (`doc-audit`, `spec-writer`, `decision-record-writer`, `handbook-writer`, `test-plan-writer`, `workflow-writer`, `readme-writer`, `drift-detector`) — the intelligent tooling that feeds the documentation.
- **4 agent personas** (`coding`, `review`, `merge`, `planning`) **all rendered in parallel** into the target project: they coexist as engine-native subagents (`.claude/agents/<id>.md`, `.codex/agents/<id>.toml`, `.opencode/agents/<id>.md`) under an umbrella `AGENTS.md`. Active engines coexist (all 3 by default); each engine has its own subdirectory at the root. Choosing which persona to invoke is a runtime decision — not an install parameter.
- Support for **project skills** (`docs/skills/*.skill.md`): domain skills versioned with the project, discovered and rendered automatically on `init`.
- **Project quality standard** (`docs/quality/code-quality.md`, optional): mechanical checking tools, judgment rules and accepted deviations, read first by `clean-code-guardian`. See the [quality pillar](./docs/handbook/quality-pillar.md).
- **14 mechanical linters** run in CI that block any PR creating detectable doc drift.
- A **companion CLI** `vaubaan-harness {init | update | uninstall | check | lint | render}`.

The harness's generated files are **gitignored** in the consuming project. The user, the CI or a script explicitly invokes `init` then `update`, through the CLI or the API. The project's documents (the 6 required pillars + the optional `docs/skills/` and `docs/quality/`) are versioned; no session runtime is required to install the harness.

## Quick start

Install:

```
npm install --save-dev @vaubaan/harness
```

Or harness the current directory directly, without installing:

```
npx -y @vaubaan/harness init .
```

Check a project's layout:

```
npx vaubaan-harness check .
```

Run the linters in CI:

```
npx vaubaan-harness lint
```

Render the harness into a target directory (all engines by default):

```
npx vaubaan-harness init <target-dir>
```

To deploy only a subset:

```
npx vaubaan-harness init <target-dir> --engines=claude-code,codex-cli
```

`init` renders the 4 personas for each selected engine and exposes the 9 built-in skills. Claude Code and OpenCode also receive 9 commands; Codex invokes skills by name, without command files. OpenCode reuses the skills already exposed in `.claude/skills/` or `.agents/skills/`. Project skills from `docs/skills/*.skill.md` are added to the same render. No `--agent` / `--kind` flag: the calling runtime picks the persona when a session starts.

To enable an MCP server (default: none):

```
npx vaubaan-harness init <target-dir> --with-mcp=context7
```

`context7` (Upstash) gives access to library documentation. The rendered file varies by engine: `.mcp.json` (claude-code), `.codex/config.toml` (codex-cli), `.opencode/opencode.json` (opencode). The MCP binary is loaded via `npx -y @upstash/context7-mcp` when the engine boots — which is why it is opt-in. **Codex loads project configuration only in an approved ("trusted") project**; `codex mcp list --json` shows the effective server. MCP discovery and launching a TOML agent were [exercised on Codex 0.154.0](./docs/research/2026-09-20-conformite-engines-verifiee.md#codex-cross-check-in-a-live-session).

**Deployed layout**: rendered content lives directly under `<target>/.claude/`, `<target>/.codex/` + `<target>/.agents/skills/` (the only skills directory Codex scans), `<target>/.opencode/`. `AGENTS.md` (umbrella, engine-neutral) and — if claude-code is included — `CLAUDE.md` (`@AGENTS.md` import) stay at the root. If `--with-mcp` is used, `.mcp.json` (claude-code) is also written at the root.

`init` also writes a `.harness-manifest.json` at the project root. To update an existing installation, inspect the plan and then apply it:

```
npx vaubaan-harness update <target-dir> --dry-run --json
npx vaubaan-harness update <target-dir>
```

`update` uses the version of the package being run, keeps the engines and the hooks preference, loads project skills and overrides, and preserves project-specific MCP and hooks. It migrates v1 to v5 manifests to v6. The preview writes nothing; applying keeps a private backup outside the project and restores the touched files on error. Running it again with no changes writes nothing.

Managed files modified locally are reported before writing. Move those changes into `.harness-overrides/`, or explicitly transfer a file to project ownership with `--preserve AGENTS.md`. This choice persists across future updates. Old manifests without hashes produce a warning before regeneration and backup. Symbolic links must be converted explicitly before migration. Details, options and recovery: [updating a project](./docs/handbook/project-update.md).

To pick a specific version, the caller can run `npx -y @vaubaan/harness@<version> update <target-dir>`. The `update` command itself downloads nothing and modifies neither the project's npm dependencies nor their pins.

`uninstall <target-dir>` removes the harness. Paths are validated before deletion and custom files outside the manifest are preserved. The OpenCode configuration is shared: `init` adds missing MCP entries without overwriting an existing entry; removal keeps other settings and any entry edited by the user. v4 installations keep their OpenCode configuration for lack of detailed ownership proof. See the [file lifecycle](./docs/handbook/uninstall.md).

The manifest, `.agents/`, the engine subdirectories, `AGENTS.md` and `CLAUDE.md` must be gitignored (`gitignore-harness` checks this).

Preview the render without touching a production directory:

```
npx vaubaan-harness render --out=/tmp/preview              # all engines
npx vaubaan-harness render --engines=opencode --out=/tmp/preview
```


## Lint configuration

By default, the linters ignore `**/node_modules/**` and `**/dist/**`. To exclude additional directories (monorepo with sub-projects, vendor, legacy…), create a configuration file at the root of the consuming project.

Supported formats (via [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), first one found is used):

| File | Format |
|---------|--------|
| `package.json` (`"harness"` key) | JSON |
| `.harnessrc` | JSON |
| `.harnessrc.json` | JSON |
| `.harnessrc.yaml` / `.harnessrc.yml` | YAML |
| `harness.config.js` / `harness.config.cjs` | JS |

Example `.harnessrc.json`:

```json
{
  "lint": {
    "ignore": [
      "vendor/**",
      "packages/legacy/**",
      "apps/*/build/**"
    ]
  }
}
```

Or directly in `package.json`:

```json
{
  "harness": {
    "lint": {
      "ignore": ["vendor/**"]
    }
  }
}
```

Patterns use [fast-glob](https://github.com/mrmlnc/fast-glob#pattern-syntax) syntax. They are added to the built-in exclusions — they do not replace them.

## Development

### Local setup

```bash
git clone https://github.com/vaubaan/harness.git
cd harness
npm install
```

### Running tests

```bash
npm test           # run all tests once
npm run test:watch # watch mode
```

### Lint & typecheck

```bash
npm run lint       # biome check
npm run lint:fix   # biome auto-fix
npm run typecheck  # tsc --noEmit
```

### Full CI gate

```bash
npm run ci         # typecheck + lint + test + build + lint:harness
```

### Submitting a PR

1. Branch from `main` using the convention `<kind>/<short-slug>` (e.g. `feat/my-feature`, `fix/readme-typo`, `test/linter-x`).
2. Run `npm run ci` locally — CI will reject if it fails.
3. Open a PR against `main`; a maintainer reviews and merges.

## Documentation

- Full spec: [docs/spec/coding-agent-harness.md](./docs/spec/coding-agent-harness.md)
- Decisions: [docs/decisions/](./docs/decisions/) — architecture choices and historical decisions
- Handbook: [docs/handbook/](./docs/handbook/)
- Tests: [docs/tests/](./docs/tests/)
- Workflow: [docs/workflow/coding-workflow.md](./docs/workflow/coding-workflow.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Project overrides are gitignored by design (see spec §11): generic improvements are proposed here as PRs. Vulnerabilities: [SECURITY.md](./SECURITY.md).

## License

[Apache 2.0](./LICENSE) — see also [NOTICE](./NOTICE).
