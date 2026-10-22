import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DisableYamlSchema } from "../loader.js";
import type { Engine, RenderedFile } from "../types.js";
import { parseYAML } from "../util/yaml.js";
import { VERSION } from "../version.js";
import {
  HOOK_CONFIG_PATHS,
  RELEASED_PATHS,
  isHookConfig,
  planHookConfigs,
  renderStopHooks,
} from "./hook-configs.js";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, MANIFEST_VERSION, type Manifest, hashContent } from "./manifest.js";
import { planInit } from "./plan-render.js";
import { readUpdateInstallation } from "./update-manifest.js";
import { applyUpdateTransaction } from "./update-transaction.js";

export interface UpdateArgs {
  targetDir: string;
  packageDir?: string;
  overridesDir?: string;
  preserveFiles?: ReadonlyArray<string>;
  dryRun?: boolean;
  /** Exact new backup directory, outside the project. Defaults to private user state. */
  backupDir?: string;
}

export interface UpdateResult {
  version: string;
  fromManifestVersion: string;
  dryRun: boolean;
  upToDate: boolean;
  filesToWrite: string[];
  filesToRemove: string[];
  warnings: string[];
  backupDir?: string;
}

export interface UpdatePlan {
  writes: RenderedFile[];
  removals: string[];
  /** Generated files the harness owns after this plan, as recorded in the manifest. */
  owned: string[];
  result: UpdateResult;
}

/** What to install: `update` reads it from the manifest, `init` from its options. */
export interface InstallationSettings {
  previous: Manifest;
  sourceVersion: string;
  engines: Engine[];
  hookEngines: Engine[];
}

function currentContent(root: string, path: string): string | undefined {
  return existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined;
}

/** True when the manifest lists `path` and the file still has the content the harness wrote. */
function ownedUnchanged(root: string, previous: Manifest, path: string): boolean {
  const content = currentContent(root, path);
  if (content === undefined || !previous.files.includes(path)) return false;
  const hash = previous.fileHashes?.[path];
  return hash === undefined || hash === hashContent(content);
}

/** Collects every conflict before failing, so one run lists all files to resolve. */
function checkArtifactConflicts(
  root: string,
  previous: Manifest,
  writes: ReadonlyArray<RenderedFile>,
  removals: ReadonlyArray<string>,
): void {
  const desired = new Map(writes.map((file) => [file.path, file.content]));
  const conflicts: string[] = [];
  for (const path of [...desired.keys(), ...removals]) {
    // Hook files are decided by planHookConfigs: left alone when not ours.
    if (isHookConfig(path)) continue;
    const content = currentContent(root, path);
    if (content === undefined || content === desired.get(path)) continue;
    if (!previous.files.includes(path)) {
      conflicts.push(`existing file outside harness manifest: ${path}`);
      continue;
    }
    const hash = previous.fileHashes?.[path];
    if (hash && hash !== hashContent(content)) conflicts.push(`modified harness file: ${path}`);
  }
  if (conflicts.length) {
    throw new Error(
      `${conflicts.join("\n")}\nmove their content to docs/ or .harness-overrides/, or keep them as yours with --preserve <path>`,
    );
  }
}

/** Files 1.x edited entry by entry leave the manifest and stay in place. */
function releaseLegacyPaths(previous: Manifest, warnings: string[]): Manifest {
  const released = previous.files.filter((path) => RELEASED_PATHS.includes(path));
  for (const path of released) {
    warnings.push(`no longer managed by the harness, left in place: ${path}`);
  }
  if (released.length === 0) return previous;
  return { ...previous, files: previous.files.filter((path) => !released.includes(path)) };
}

/** All reads and validation precede backup creation and project mutations. */
export function planInstallation(
  args: Omit<UpdateArgs, "dryRun" | "backupDir">,
  settings: InstallationSettings,
): Omit<UpdatePlan, "result"> & { manifest: Manifest; warnings: string[] } {
  const root = resolve(args.targetDir);
  const { engines, hookEngines } = settings;
  const warnings: string[] = [];
  const previous = releaseLegacyPaths(settings.previous, warnings);
  const preserved = [
    ...new Set([...(previous.preservedFiles ?? []), ...(args.preserveFiles ?? [])]),
  ].sort();
  if (preserved.includes(MANIFEST_FILENAME))
    throw new Error("cannot preserve the harness manifest");
  assertManagedPaths(root, [...previous.files, ...preserved, ...HOOK_CONFIG_PATHS]);
  const requestedOverrides = args.overridesDir ?? previous.overridesDir;
  const overridesDir = args.overridesDir
    ? resolve(args.overridesDir)
    : previous.overridesDir
      ? resolve(root, previous.overridesDir)
      : root;
  if (requestedOverrides && !existsSync(join(overridesDir, ".harness-overrides"))) {
    throw new Error(`recorded overrides are missing: ${overridesDir}/.harness-overrides`);
  }
  const hasOverrides = existsSync(join(overridesDir, ".harness-overrides"));
  const disablePath = join(overridesDir, ".harness-overrides", "disable.yaml");
  if (existsSync(disablePath)) {
    try {
      DisableYamlSchema.parse(parseYAML(readFileSync(disablePath, "utf8")));
    } catch {
      throw new Error(`invalid override selection: ${disablePath}`);
    }
  }
  const rendered = planInit({
    targetDir: root,
    packageDir: args.packageDir,
    engines,
    overridesDir: hasOverrides ? overridesDir : undefined,
    withStopHook: false,
  });
  const hooks = renderStopHooks(hookEngines);
  const generated = [
    ...rendered.output.files,
    ...hooks.files.filter((file) => !isHookConfig(file.path)),
  ];
  const hookPlan = planHookConfigs(
    root,
    hooks.files.filter((file) => isHookConfig(file.path)),
    previous.files,
    (path) => ownedUnchanged(root, previous, path),
  );
  const output = [...generated, ...hookPlan.writes].filter(
    (file) => !preserved.includes(file.path),
  );
  const owned = [...new Set([...generated.map((file) => file.path), ...hookPlan.owned])]
    .filter((file) => !preserved.includes(file))
    .sort();
  const removals = [
    ...new Set([
      ...previous.files.filter((file) => !owned.includes(file) && !isHookConfig(file)),
      ...hookPlan.removals,
    ]),
  ].filter((file) => !preserved.includes(file));
  assertManagedPaths(root, [...output.map((file) => file.path), ...removals]);
  checkArtifactConflicts(root, previous, output, removals);
  const hashes = Object.fromEntries(
    owned.map((path) => {
      const content =
        output.find((file) => file.path === path)?.content ?? currentContent(root, path);
      if (content === undefined) throw new Error(`missing planned harness file: ${path}`);
      return [path, hashContent(content)];
    }),
  );
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    harnessVersion: VERSION,
    engines: [...engines].sort(),
    renderedAt: previous.renderedAt,
    files: owned,
    fileHashes: hashes,
    stopHookInstalled: hookEngines.length > 0,
    stopHookEngines: [...hookEngines].sort(),
    ...(hasOverrides ? { overridesDir: overridesDir === root ? "." : overridesDir } : {}),
    ...(preserved.length ? { preservedFiles: preserved } : {}),
  };
  const writes = output.filter((file) => currentContent(root, file.path) !== file.content);
  const existingRemovals = removals.filter((path) => existsSync(join(root, path)));
  if (writes.length || existingRemovals.length || !isDeepStrictEqual(settings.previous, manifest)) {
    manifest.renderedAt = new Date().toISOString();
    writes.push({ path: MANIFEST_FILENAME, content: `${JSON.stringify(manifest, null, 2)}\n` });
  }
  warnings.push(...rendered.output.warnings, ...hooks.warnings, ...hookPlan.warnings);
  if (preserved.length) warnings.push(`preserved user-owned artifacts: ${preserved.join(", ")}`);
  return { writes, removals: existingRemovals, owned, manifest, warnings };
}

/** All reads and validation precede backup creation and project mutations. */
export function planUpdate(args: UpdateArgs): UpdatePlan {
  const root = resolve(args.targetDir);
  const { manifest: previous, sourceVersion, engines, hookEngines } = readUpdateInstallation(root);
  const plan = planInstallation(args, { previous, sourceVersion, engines, hookEngines });
  const warnings = [...plan.warnings];
  if (!previous.fileHashes) {
    warnings.push(
      "legacy manifest has no file fingerprints: managed artifacts will be regenerated; backup preserves their previous contents",
    );
  }
  if (engines.includes("codex-cli"))
    warnings.push("ensure .agents/ is ignored by Git (run harness check)");
  return {
    writes: plan.writes,
    removals: plan.removals,
    owned: plan.owned,
    result: {
      version: VERSION,
      fromManifestVersion: sourceVersion,
      dryRun: args.dryRun === true,
      upToDate: plan.writes.length === 0 && plan.removals.length === 0,
      filesToWrite: plan.writes.map((file) => file.path),
      filesToRemove: plan.removals,
      warnings,
    },
  };
}

export function updateCommand(args: UpdateArgs): UpdateResult {
  const plan = planUpdate(args);
  if (args.dryRun || plan.result.upToDate) return plan.result;
  const { backupDir } = applyUpdateTransaction(
    resolve(args.targetDir),
    plan.writes,
    plan.removals,
    args.backupDir,
  );
  return { ...plan.result, backupDir };
}
