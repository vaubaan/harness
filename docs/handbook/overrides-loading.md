---
tracks:
  - src/render.ts
  - src/loader.ts
  - src/util/yaml.ts
  - src/cli/init.ts
  - src/cli/plan-render.ts
  - src/cli/index.ts
last_reviewed: 2026-10-22
---

# Overrides loading

`.harness-overrides/` lets a developer add, replace or disable
skills and commands on top of the embedded stock, without touching the
package or publishing to npm.

## The contract

Per spec §11: `.harness-overrides/` lives in the harness **target
directory**, is **gitignored by construction** (required by the
`gitignore-harness` linter), and follows the same layout as the package:

```
<target-dir>/.harness-overrides/
  skills/      *.skill.md   (optional)
  commands/    *.cmd.md     (optional)
  disable.yaml             (optional)
```

It is local, disposable, and specific to one developer. Ideal for testing a custom
skill before upstreaming it, or for disabling a cmd that pollutes a
particular invocation. Skills meant for the whole team go in
`docs/skills/`, which is versioned ([project skills](./project-skills.md)).

## `loadOverrides` — reading the folder

Implemented in `src/loader.ts`. Three notable things:

1. **No `.harness-overrides/` → `undefined`**.
   No degradation, no warning. This is the normal mode for
   almost all invocations.
2. **Reuses `loadHarness`** with explicit subdirectories
   (`skillsDir`, `commandsDir`). So Zod validation, frontmatter parsing,
   strict `*.skill.md` extension: everything is shared with loading
   the stock. A malformed skill in `.harness-overrides/skills/` makes
   `loadOverrides` crash exactly like a malformed stock skill.
3. **`disable.yaml`** is read via `parseYAML` (`src/util/yaml.ts`,
   a minimal wrapper over `yaml.parse`). The defensive check
   verifies that we indeed have `{ disable: string[] }`;
   any other shape = `disable = []` silently (no error, but
   no surprise disabling either).

Expected format:

```yaml
# .harness-overrides/disable.yaml
disable:
  - readme-writer
  - workflow-writer
```

The listed ids are removed from the final harness, **after** the additions are merged:
see the order in `applyOverrides`.

## `applyOverrides` — in-memory merge

`src/render.ts`:

```ts
export function applyOverrides(harness: Harness, overrides: HarnessOverrides | undefined): Harness {
  const disabled = overrides?.disable ?? [];
  return {
    skills: removeByIds(mergeById(harness.skills, overrides?.add?.skills), disabled),
    cmds: removeByIds(mergeById(harness.cmds, overrides?.add?.cmds), disabled),
  };
}
```

`mergeById` lays the stock in a `Map` by id, then `Map.set`s each added
item; `removeByIds` filters the disabled ids out of the result.

**Three precedence rules**, in order:

1. The stock is laid down first. Project skills from `docs/skills/` are
   merged into the stock before the overrides apply (`render()`).
2. The `added` items overwrite **by id**: an override with the same `id` as a
   stock or project skill *wins*. This is "override" semantics in the strict sense.
3. The `disabled` ids are removed at the end: a disabled id disappears even if it
   comes from an `add`. So `disable.yaml` is the final authority.

The order is invariant. If you list `my-skill` both in `add` and
in `disable`, the skill **does not appear** in the output.

## Wiring from the CLI

`vaubaan-harness init` (`src/cli/index.ts`) exposes
`--overrides-dir <dir>`, the parent of `.harness-overrides/`. Without it,
`planInstallation` (`src/cli/update.ts`) uses the parent recorded in the
manifest, or the target directory itself when it holds a
`.harness-overrides/` folder. The choice is recorded in the manifest
(`overridesDir`, `.` for the local folder) so that `update` and
`lint:generated-fresh` replay the same overrides.

`planInit` (`src/cli/plan-render.ts`):

```ts
const harness = loadHarness(packageDir);
const overrides = args.overridesDir ? loadOverrides(args.overridesDir) : undefined;
const projectSkills = loadProjectSkills(args.targetDir);
const output = render({ harness, engines, overrides, projectSkills, hasQualityDoc });
```

**Important**: `vaubaan-harness render` does **not** expose `--overrides-dir`.
This is deliberate. `render` is positioned as a preview of the pure stock
(see the description: "Render harness for preview (no overrides
applied)"). If you want a preview *with* overrides, use `init` into a
disposable directory.

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

vaubaan-harness init ./my-project --engines=claude-code --overrides-dir .
```

Result: the skill appears in `./my-project/.claude/skills/my-custom-skill/SKILL.md`.
`.harness-overrides/` stays out of git; the rendered skill is a generated
file like the others and is committed. Upstream workflow: a PR to add it
to `src/skills/` (or to the project's `docs/skills/`), then delete the
local copy and run `update`.

## Debug and pitfalls

- **Override silently ignored** — strict extension (`*.skill.md`,
  not `*.md`).
- **`disable.yaml` has no effect** — the expected structure is exactly
  `{ disable: [id, …] }`. Any other shape = `disable = []` without error.
- **Id collision** — the override always wins (`Map.set` in
  `mergeById`). If you expected to see two skills, rename.
- **Final target directory almost empty** — cross-check with the
  `--engines` value and the capability warnings
  ([capabilities matrix](./capabilities-matrix.md)).
- **`.harness-overrides/` must be gitignored** — this is the invariant
  checked by `lint:gitignore-harness` (`src/linters/gitignore-harness.ts`).
  A committed override should live in the upstream package or in
  `docs/skills/`.
- **`lint:generated-fresh` fails on a teammate's machine** — the
  committed render includes your personal overrides. That is what the
  linter is for: keep team skills in `docs/skills/`.
