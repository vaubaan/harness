---
tracks:
  - src/render.ts
  - src/loader.ts
  - src/util/yaml.ts
  - src/cli/init.ts
  - src/cli/index.ts
---

# Overrides loading

`.harness-overrides/` lets a developer add, replace or disable
skills/cmds/agents on top of the embedded stock — without touching the package
or publishing to npm.

## The contract

Per spec §11: `.harness-overrides/` lives in the harness **target
directory**, is **gitignored by construction** (see the
`gitignore-harness` linter), and follows the same layout as the package:

```
<target-dir>/.harness-overrides/
  agents/      *.agent.md   (optional)
  skills/      *.skill.md   (optional)
  commands/    *.cmd.md     (optional)
  disable.yaml             (optional)
```

It is local, disposable, and specific to one developer. Ideal for testing a custom
skill before upstreaming it — or for disabling a cmd that pollutes a
particular invocation.

## `loadOverrides` — reading the folder

Implemented in `src/loader.ts:35-55`. Three notable things:

1. **No `.harness-overrides/` → `undefined`** (`src/loader.ts:37`).
   No degradation, no warning. This is the normal mode for
   almost all invocations.
2. **Reuses `loadHarness`** with explicit subdirectories
   (`src/loader.ts:39-43`). So Zod validation, frontmatter parsing,
   strict `*.skill.md` extension — everything is shared with loading
   the stock. A malformed skill in `.harness-overrides/skills/` makes
   `loadOverrides` crash exactly like a malformed stock skill.
3. **`disable.yaml`** is read via `parseYAML` (`src/util/yaml.ts:3-5`,
   a minimal wrapper over `yaml.parse`). The defensive check
   (`src/loader.ts:45-52`) verifies that we indeed have `{ disable: string[] }`;
   any other shape = `disable = []` silently (no error, but
   no surprise disabling either).

Expected format:

```yaml
# .harness-overrides/disable.yaml
disable:
  - readme-writer
  - workflow-writer
```

The listed ids are removed from the final harness, **after** the additions are merged —
see the order in `applyOverrides`.

## `applyOverrides` — in-memory merge

`src/render.ts:69-76`:

```ts
export function applyOverrides(harness: Harness, overrides: HarnessOverrides | undefined): Harness {
  const disabled = overrides?.disable ?? [];
  return {
    agents: mergeById(harness.agents, overrides?.add?.agents, disabled),
    skills: mergeById(harness.skills, overrides?.add?.skills, disabled),
    cmds:   mergeById(harness.cmds,   overrides?.add?.cmds,   disabled),
  };
}
```

And `mergeById` (`src/render.ts:48-58`):

```ts
function mergeById<T extends { meta: { id: string } }>(
  stock: ReadonlyArray<T>,
  added: ReadonlyArray<T> | undefined,
  disabled: ReadonlyArray<string>,
): T[] {
  const result = new Map<string, T>();
  for (const item of stock) result.set(item.meta.id, item);
  if (added) {
    for (const item of added) result.set(item.meta.id, item);
  }
  for (const id of disabled) result.delete(id);
  return Array.from(result.values());
}
```

**Three precedence rules**, in order:

1. The stock is laid down first.
2. The `added` items overwrite **by id** — an override with the same `id` as a
   stock skill *wins*. This is "override" semantics in the strict sense.
3. The `disabled` ids are removed at the end — a disabled id disappears even if it
   comes from an `add`. So `disable.yaml` is the final authority.

The order is invariant. If you list `my-skill` both in `add` and
in `disable`, the skill **does not appear** in the output.

## Wiring from the CLI

Wired into `vaubaan-harness init` (`src/cli/index.ts:29-68`):

```ts
.option("--engines <list>", "comma-separated subset of engines — defaults to all 3")
.option("--overrides-dir <dir>", "directory containing .harness-overrides/")
.action((targetDir, opts) => {
  const engines = opts.engines ? opts.engines.split(",").map((s) => s.trim()) : undefined;
  const result = initCommand({
    targetDir,
    engines,
    overridesDir: opts.overridesDir,
    packageDir,
  });
});
```

And in `planInit` (`src/cli/init.ts:71-75`):

```ts
const harness = loadHarness(args.packageDir);
const overrides = args.overridesDir ? loadOverrides(args.overridesDir) : undefined;
const output = render({ harness, engines: engineList, overrides });
```

**Important**: `vaubaan-harness render` does **not** expose `--overrides-dir`
(`src/cli/index.ts:114-143`) — this is deliberate. `render` is positioned as a
preview of the pure stock (see the description: "Render harness for preview
(no overrides applied)"). If you want a preview *with* overrides, use
`init` into a disposable directory.

## End-to-end example

A developer wants to test a new skill `my-custom-skill` in their project:

```bash
mkdir -p .harness-overrides/skills
cat > .harness-overrides/skills/my-custom-skill.skill.md <<'EOF'
---
id: my-custom-skill
description: prototype skill local
---
# My custom skill
EOF

vaubaan-harness init ./my-project --overrides-dir .
```

Result: the skill appears in `./my-project/.claude/skills/my-custom-skill/SKILL.md`.
No commit needed; `.harness-overrides/` stays out of git. Upstream
workflow: a PR to add it to `src/skills/`, then delete the local copy.

## Debug and pitfalls

- **Override silently ignored** — strict extension (`*.skill.md`,
  not `*.md`).
- **`disable.yaml` has no effect** — the expected structure is exactly
  `{ disable: [id, …] }`. Any other shape = `disable = []` without error.
- **Id collision** — the override always wins (`Map.set` in
  `mergeById`, `src/render.ts:55`). If you expected to see two skills,
  rename.
- **Final target directory empty** — cross-check with the `engines` filters
  and the capability warnings (handbook 02).
- **`.harness-overrides/` must be gitignored** — this is the invariant
  checked by `lint:gitignore-harness` (`src/linters/gitignore-harness.ts`).
  A committed override should live in the upstream package.
- **Agents can be overridden too** (`src/render.ts:72`) — rare but
  supported.
