import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadHarness, loadOverrides, loadProjectSkills } from "../loader.js";
import { resolveMcpIds } from "../mcp.js";
import { type RenderOutput, render } from "../render.js";
import { ENGINES, type Engine, type RenderedFile } from "../types.js";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, readManifest, writeManifest } from "./manifest.js";
import { OPENCODE_CONFIG_PATH, planOpenCodeConfig } from "./opencode-config.js";
import { removeRenderedFiles } from "./uninstall.js";

/** Cardinal file of the optional `docs/quality/` pillar. */
const QUALITY_DOC_PATH = "docs/quality/code-quality.md";

export interface InitArgs {
  targetDir: string;
  engines?: ReadonlyArray<string>;
  overridesDir?: string;
  /**
   * Directory containing the harness content (agents/, skills/, commands/,
   * templates/). Defaults to the harness package's own `dist/` (resolved
   * via `import.meta.url`), so programmatic callers usually omit it.
   */
  packageDir?: string;
  mcpServers?: ReadonlyArray<string>;
  /**
   * Stop-hook installation. Default `true`. When enabled, each engine
   * receives a hook config that calls `vaubaan-harness stop-hook
   * --engine <engine>` and injects the lint report (with skill
   * suggestions) into the running session whenever the worktree is
   * dirty and lint fails at end-of-turn. Pass `false` to skip the
   * hook configs entirely (runtime kill-switch remains available via
   * `HARNESS_LINT_DISABLE=1`).
   */
  withStopHook?: boolean;
}

export interface InitResult {
  filesWritten: string[];
  /** Files a previous `init` rendered that this one no longer does (layout change, engine dropped). */
  staleFilesRemoved: string[];
  warnings: string[];
  stopHookInstalled: boolean;
}

function resolveEngineList(requested: ReadonlyArray<string> | undefined): Engine[] {
  if (!requested || requested.length === 0) return [...ENGINES];
  return requested.map((e) => {
    if (!ENGINES.includes(e as Engine)) {
      throw new Error(`unknown engine: ${e} (expected one of ${ENGINES.join(", ")})`);
    }
    return e as Engine;
  });
}

/**
 * Resolves the harness package's bundled content directory. The CAH
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

export function planInit(args: InitArgs): {
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
  const mcpServers = args.mcpServers ? resolveMcpIds(args.mcpServers) : undefined;
  const stopHookInstalled = args.withStopHook !== false;
  const output = render({
    harness,
    engines,
    overrides,
    projectSkills,
    hasQualityDoc,
    mcpServers,
    withStopHook: stopHookInstalled,
  });
  return { engines, output, stopHookInstalled };
}

export function writeFilesToTarget(
  files: ReadonlyArray<RenderedFile>,
  targetDir: string,
): string[] {
  assertManagedPaths(
    targetDir,
    files.map((file) => file.path),
  );
  const written: string[] = [];
  for (const f of files) {
    const full = join(targetDir, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
    written.push(f.path);
  }
  return written;
}

export function initCommand(args: InitArgs): InitResult {
  const { engines, output, stopHookInstalled } = planInit(args);
  const previous = readManifest(args.targetDir);
  assertManagedPaths(args.targetDir, [
    MANIFEST_FILENAME,
    ...(previous?.files ?? []),
    ...output.files.map((file) => file.path),
    ...(previous?.opencodeConfig ? [OPENCODE_CONFIG_PATH] : []),
  ]);
  const desiredConfig = output.files.find((file) => file.path === OPENCODE_CONFIG_PATH);
  const config = planOpenCodeConfig(args.targetDir, desiredConfig, previous?.opencodeConfig);
  const next = new Set(output.files.map((f) => f.path));
  const stale = (previous?.files ?? []).filter((f) => !next.has(f) && f !== OPENCODE_CONFIG_PATH);
  if (config.remove) stale.push(OPENCODE_CONFIG_PATH);
  const staleFilesRemoved = removeRenderedFiles(resolve(args.targetDir), stale).filesRemoved;
  const ownedFiles = output.files.filter((file) => file.path !== OPENCODE_CONFIG_PATH);
  const filesWritten = writeFilesToTarget(ownedFiles, args.targetDir);
  if (config.write) writeFilesToTarget([config.write], args.targetDir);
  writeManifest(args.targetDir, engines, filesWritten, {
    stopHookInstalled,
    stopHookEngines: stopHookInstalled ? engines : undefined,
    opencodeConfig: config.ownership,
    overridesDir: args.overridesDir
      ? resolve(args.overridesDir) === resolve(args.targetDir)
        ? "."
        : resolve(args.overridesDir)
      : undefined,
  });
  if (config.write) filesWritten.push(OPENCODE_CONFIG_PATH);
  const warnings = [...output.warnings, ...config.warnings];
  if (previous?.files.includes(OPENCODE_CONFIG_PATH) && !previous.opencodeConfig) {
    warnings.push(`preserved legacy shared configuration: ${OPENCODE_CONFIG_PATH}`);
  }
  return { filesWritten, staleFilesRemoved, warnings, stopHookInstalled };
}
