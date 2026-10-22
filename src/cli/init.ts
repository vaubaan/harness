import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Engine, RenderedFile } from "../types.js";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, MANIFEST_VERSION, type Manifest, readManifest } from "./manifest.js";
import { planInit, resolveEngineList } from "./plan-render.js";
import { pruneEmptyDirs } from "./uninstall.js";
import { applyUpdateTransaction } from "./update-transaction.js";
import { planInstallation } from "./update.js";

export { planInit };

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
  /** Generated files to leave to the project instead of rendering them. */
  preserveFiles?: ReadonlyArray<string>;
  /** Exact new backup directory, outside the project. Defaults to private user state. */
  backupDir?: string;
}

export interface InitResult {
  /** Generated files the harness owns after this run. */
  filesWritten: string[];
  /** Files a previous `init` rendered that this one no longer does (layout change, engine dropped). */
  staleFilesRemoved: string[];
  warnings: string[];
  stopHookInstalled: boolean;
  engines: Engine[];
  /** Set when existing project files were changed; holds their previous contents. */
  backupDir?: string;
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

function emptyManifest(engines: ReadonlyArray<Engine>): Manifest {
  return { version: MANIFEST_VERSION, engines: [...engines], renderedAt: "", files: [] };
}

/**
 * Installs or re-renders the harness. Shares the planner of `update`: files
 * the harness does not own are never overwritten, merged or deleted, and
 * changes are applied in one transaction (see docs/decisions/safe-init.md
 * and docs/decisions/no-mcp-no-code-merge.md).
 */
export function initCommand(args: InitArgs): InitResult {
  const root = resolve(args.targetDir);
  const engines = resolveEngineList(args.engines);
  const stopHookInstalled = args.withStopHook !== false;
  const previous = readManifest(root) ?? emptyManifest(engines);
  const plan = planInstallation(
    {
      targetDir: root,
      packageDir: args.packageDir,
      overridesDir: args.overridesDir,
      preserveFiles: args.preserveFiles,
    },
    {
      previous,
      sourceVersion: previous.version,
      engines,
      hookEngines: stopHookInstalled ? engines : [],
    },
  );
  const touchedExisting = [...plan.writes.map((file) => file.path), ...plan.removals].some(
    (path) => path !== MANIFEST_FILENAME && existsSync(join(root, path)),
  );
  let backupDir: string | undefined;
  if (plan.writes.length || plan.removals.length) {
    backupDir = applyUpdateTransaction(root, plan.writes, plan.removals, args.backupDir).backupDir;
    if (!touchedExisting && !args.backupDir) {
      rmSync(backupDir, { recursive: true, force: true });
      backupDir = undefined;
    }
    // Dropping an engine leaves its folders empty; remove them like uninstall does.
    pruneEmptyDirs(root, new Set(plan.removals.map((path) => dirname(join(root, path)))));
  }
  return {
    filesWritten: plan.owned,
    staleFilesRemoved: plan.removals,
    warnings: plan.warnings,
    stopHookInstalled,
    engines,
    ...(backupDir ? { backupDir } : {}),
  };
}
