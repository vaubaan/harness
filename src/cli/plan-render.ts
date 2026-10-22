import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadHarness, loadOverrides, loadProjectSkills } from "../loader.js";
import { type RenderOutput, render } from "../render.js";
import { ENGINES, type Engine } from "../types.js";

/** Cardinal file of the optional `docs/quality/` pillar. */
const QUALITY_DOC_PATH = "docs/quality/code-quality.md";

export interface RenderPlanArgs {
  targetDir: string;
  engines?: ReadonlyArray<string>;
  overridesDir?: string;
  packageDir?: string;
  withStopHook?: boolean;
}

export function resolveEngineList(requested: ReadonlyArray<string> | undefined): Engine[] {
  if (!requested) return [...ENGINES];
  if (requested.length === 0) throw new Error("no engine selected");
  const engines = requested.map((e) => {
    if (!ENGINES.includes(e as Engine)) {
      throw new Error(`unknown engine: ${e} (expected one of ${ENGINES.join(", ")})`);
    }
    return e as Engine;
  });
  return [...new Set(engines)];
}

/**
 * Resolves the harness package's bundled content directory. The harness
 * tsup config emits this module to both `dist/init.js` (programmatic
 * `./init` export) and inlines it into `dist/cli/index.js` (CLI use). The
 * content (`agents/`, `skills/`, `commands/`, `templates/`) always sits
 * at `dist/` — same dir as `dist/init.js`, parent of `dist/cli/index.js`.
 * In dev (`src/cli/init.ts`) the content also sits at `src/`. We
 * disambiguate by checking which ancestor contains `agents/`.
 */
function defaultPackageDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  if (existsSync(join(here, "agents"))) return here;
  return resolve(here, "..");
}

export function planInit(args: RenderPlanArgs): {
  engines: Engine[];
  output: RenderOutput;
  stopHookInstalled: boolean;
} {
  const engines = resolveEngineList(args.engines);
  const packageDir = args.packageDir ?? defaultPackageDir();
  const harness = loadHarness(packageDir);
  const overrides = args.overridesDir ? loadOverrides(args.overridesDir) : undefined;
  const projectSkills = loadProjectSkills(args.targetDir);
  const hasQualityDoc = existsSync(join(args.targetDir, QUALITY_DOC_PATH));
  const stopHookInstalled = args.withStopHook !== false;
  const output = render({
    harness,
    engines,
    overrides,
    projectSkills,
    hasQualityDoc,
    withStopHook: stopHookInstalled,
  });
  return { engines, output, stopHookInstalled };
}
