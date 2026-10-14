---
tracks:
  - src/cli/index.ts
  - src/cli/init.ts
  - src/cli/update.ts
  - src/cli/render.ts
  - src/cli/check.ts
  - src/cli/manifest.ts
  - src/loader.ts
  - scripts/copy-content.mjs
  - tsup.config.ts
  - package.json
last_reviewed: 2026-09-20
---

# CLI package resolution

How the CLI knows where to find `agents/`, `skills/`, `commands/`,
`templates/` — whether you are running `tsx src/cli/index.ts` (dev) or
`./node_modules/.bin/vaubaan-harness` (prod).

## The problem

The pivot contents live **next to the code** (`src/agents/`, `src/skills/`,
…). At build time, `tsup` only produces JS in `dist/`, ignoring the `.md` files
that are our "assets". So in prod, without intervention, `dist/cli/index.js`
would look for `dist/agents/`, which does not exist.

## Two complementary tricks

### 1. `resolvePackageDir()` — directory layout convention

`src/cli/index.ts`:

```ts
function resolvePackageDir(): string {
  // CLI lives at <contentRoot>/cli/index.{ts,js}.
  // In dev <contentRoot> = src/ ; in prod (after tsup + copy) = dist/.
  // Both contain agents/, skills/, commands/, templates/ as siblings of cli/.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}
```

The invariant held **by both modes**: `cli/` has `agents/`,
`skills/`, `commands/`, `templates/` as siblings. So `dirname(__import.meta.url__) + ".."`
always points to the contents root.

- In dev (ts-node / vitest / `tsx`): `here = .../src/cli/`, so
  `packageDir = .../src/`.
- In prod (after `tsup` + `copy-content.mjs`): `here = .../dist/cli/`, so
  `packageDir = .../dist/`.

The comment in the source acts as an implicit spec — move these files and
you break the resolution.

### 2. `scripts/copy-content.mjs` — recreating the layout in prod

`scripts/copy-content.mjs`:

```js
const DIRS = ["agents", "skills", "commands", "templates"];
for (const dir of DIRS) {
  const src = resolve(repoRoot, "src", dir);
  const dst = resolve(repoRoot, "dist", dir);
  if (!existsSync(src)) { console.error(`✘ missing source: ${src}`); process.exit(1); }
  cpSync(src, dst, { recursive: true });
}
```

It is wired into the `build` script (`package.json`):

```json
"build": "tsup && node scripts/copy-content.mjs"
```

`tsup` generates the JS in `dist/`, then the 4 content folders are copied.
The distributed bundle (`files: ["dist", "README.md"]`, `package.json`)
therefore contains *everything* the CLI needs.

> See [the content-under-src ADR](../decisions/content-under-src.md) for the context of this decision (do not embed the
> contents as string literals, do not search upward for `package.json`).

## How `loadHarness` consumes `packageDir`

`src/loader.ts`:

```ts
export function loadHarness(packageDir: string, opts: LoadOptions = {}): Harness {
  const agentsDir   = opts.agentsDir   ?? join(packageDir, "agents");
  const skillsDir   = opts.skillsDir   ?? join(packageDir, "skills");
  const commandsDir = opts.commandsDir ?? join(packageDir, "commands");

  const agentFiles  = fg.sync("*.agent.md",  { cwd: agentsDir,   absolute: true });
  const skillFiles  = fg.sync("*.skill.md",  { cwd: skillsDir,   absolute: true });
  const cmdFiles    = fg.sync("*.cmd.md",    { cwd: commandsDir, absolute: true });

  return {
    agents: agentFiles.map((f) => parseAgent(f, readFileSync(f, "utf8"))),
    skills: skillFiles.map((f) => parseSkill(f, readFileSync(f, "utf8"))),
    cmds:   cmdFiles.map((f)   => parseCmd(f, readFileSync(f, "utf8"))),
  };
}
```

Three subdirectories read independently by `fast-glob`, each file parsed via
the appropriate parser (see [renderer pipeline](./renderer-pipeline.md)). The glob is narrow (`*.agent.md`,
`*.skill.md`, `*.cmd.md`) — no recursion, no surprises.

The `agentsDir` / `skillsDir` / `commandsDir` options make it possible to
**decouple** the subdirectories from `packageDir`. This is used by
`loadOverrides` to read a `.harness-overrides/` that follows the same
layout ([overrides loading](./overrides-loading.md)).

## Override via `--package-dir`

The `init` and `render` commands expose `--package-dir <dir>`:

The declaration and the `opts.packageDir ?? resolvePackageDir()` fallback
are in `src/cli/index.ts`. `update` uses the content of the
running package; its API accepts a fixture `packageDir`, but the
CLI does not expose this option.

Use cases:

- **Tests** — point to a fixture in a temporary directory.
- **Dev on the harness itself** — use this fork for a test deployment
  without publishing to npm. `vaubaan-harness init /tmp/target --package-dir /path/to/fork/src` works directly (all engines by default).

## Commands that depend on it

Entries in the CLI (`src/cli/index.ts`):

| Command    | Uses `packageDir`?     | Description                                          |
|------------|------------------------|------------------------------------------------------|
| `init`     | yes (via `initCommand`)| Render + write into a target directory               |
| `update`   | yes (via `planInit`)   | Migration with preview and backup                    |
| `uninstall`| no                     | Removal based on the manifest and recorded ownership |
| `render`   | yes (via `renderCommand`)| Render-only for preview, **no** overrides          |
| `check`    | no (reads the audited repo)| Checks 6 pillars + `.gitignore`                  |
| `lint`     | no                     | Runs the 14 linters via `runLinters`                 |
| `stop-hook`| no                     | Checks the project at the end of an agent turn       |
| `--version`| n/a                    | commander                                            |

`check` and `lint` operate on a **target repo** (`--cwd` or positional
argument), not on the harness package. So they do not need to
resolve `packageDir`.

## Debug

- **`vaubaan-harness init` throws `ENOENT: agents/`** — `resolvePackageDir()` did
  not find the contents. In prod: did the build actually run
  `copy-content.mjs`? Check `ls dist/agents/`. In dev: which directory are you
  running the CLI from? `import.meta.url` does not depend on `cwd`, but
  on a possible bundle that might have moved `cli/`.
- **`loadHarness` returns `{ agents: [], … }`** — the glob finds zero files.
  Probably the wrong extension (the pattern is strict: `*.agent.md`,
  not `*.md`).
- **Target directory empty after `init`** — may be the filtering by
  `engine`. Look at stderr for capability warnings
  ([capabilities matrix](./capabilities-matrix.md)).

## Pitfalls

- **Do not search upward for `package.json`**. `find-package-json` or
  `import.meta.resolve('@vaubaan/harness/package.json')` seemed tempting —
  rejected ([content-under-src ADR](../decisions/content-under-src.md)) because it is fragile under pnpm/yarn-pnp and slow. The
  "sibling of `cli/`" convention is more robust.
- **The build cleans before copying**. `tsup.config.ts` enables `clean`,
  then `copy-content.mjs` copies the contents again. Running the copy
  script alone does not remove old renamed files: use
  `npm run build` to get a clean package.
- **`templates/` is copied but not read by `loadHarness`**. It serves
  skills that scaffold via a direct `cp` from `packageDir + "/templates"`.
  Do not delete it even if it seems inert from `loadHarness`'s point of view.
