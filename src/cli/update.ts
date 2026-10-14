import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DisableYamlSchema } from "../loader.js";
import type { RenderedFile } from "../types.js";
import { parseYAML } from "../util/yaml.js";
import { VERSION } from "../version.js";
import { planInit } from "./init.js";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, MANIFEST_VERSION, type Manifest, hashContent } from "./manifest.js";
import { SHARED_CONFIG_PATHS, planUpdateConfigs } from "./update-config.js";
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
  result: UpdateResult;
}

function currentContent(root: string, path: string): string | undefined {
  return existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined;
}

function checkArtifactConflicts(
  root: string,
  previous: Manifest,
  writes: ReadonlyArray<RenderedFile>,
  removals: ReadonlyArray<string>,
): void {
  const desired = new Map(writes.map((file) => [file.path, file.content]));
  for (const path of [...desired.keys(), ...removals]) {
    if (SHARED_CONFIG_PATHS.includes(path)) continue;
    const content = currentContent(root, path);
    if (content === undefined) continue;
    if (!previous.files.includes(path)) {
      throw new Error(
        `existing file outside harness manifest: ${path}; use overrides or --preserve`,
      );
    }
    const hash = previous.fileHashes?.[path];
    if (hash && hash !== hashContent(content) && content !== desired.get(path)) {
      throw new Error(`modified harness file: ${path}; move edits to overrides or use --preserve`);
    }
  }
}

/** All reads and validation precede backup creation and project mutations. */
export function planUpdate(args: UpdateArgs): UpdatePlan {
  const root = resolve(args.targetDir);
  const { manifest: previous, sourceVersion, engines, hookEngines } = readUpdateInstallation(root);
  const preserved = [
    ...new Set([...(previous.preservedFiles ?? []), ...(args.preserveFiles ?? [])]),
  ].sort();
  if (preserved.includes(MANIFEST_FILENAME))
    throw new Error("cannot preserve the harness manifest");
  if (preserved.some((path) => SHARED_CONFIG_PATHS.includes(path))) {
    throw new Error(
      "--preserve applies to generated artifacts; shared configurations use entry-level preservation",
    );
  }
  assertManagedPaths(root, [...previous.files, ...preserved, ...SHARED_CONFIG_PATHS]);
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
  const config = planUpdateConfigs(root, previous, hookEngines);
  const output = [...rendered.output.files, ...config.writes].filter(
    (file) => !preserved.includes(file.path),
  );
  const owned = [
    ...new Set([...rendered.output.files.map((file) => file.path), ...config.ownedFiles]),
  ]
    .filter((file) => !preserved.includes(file))
    .sort();
  const removals = [
    ...new Set([
      ...previous.files.filter(
        (file) => !owned.includes(file) && !SHARED_CONFIG_PATHS.includes(file),
      ),
      ...config.removals,
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
    ...(config.opencodeConfig ? { opencodeConfig: config.opencodeConfig } : {}),
    ...(config.hookConfigs ? { hookConfigs: config.hookConfigs } : {}),
  };
  const writes = output.filter((file) => currentContent(root, file.path) !== file.content);
  const existingRemovals = removals.filter((path) => existsSync(join(root, path)));
  if (writes.length || existingRemovals.length || !isDeepStrictEqual(previous, manifest)) {
    manifest.renderedAt = new Date().toISOString();
    writes.push({ path: MANIFEST_FILENAME, content: `${JSON.stringify(manifest, null, 2)}\n` });
  }
  const warnings = [...rendered.output.warnings, ...config.warnings];
  if (!previous.fileHashes) {
    warnings.push(
      "legacy manifest has no file fingerprints: managed artifacts will be regenerated; backup preserves their previous contents",
    );
  }
  if (preserved.length) warnings.push(`preserved user-owned artifacts: ${preserved.join(", ")}`);
  if (engines.includes("codex-cli"))
    warnings.push("ensure .agents/ is ignored by Git (run harness check)");
  return {
    writes,
    removals: existingRemovals,
    result: {
      version: VERSION,
      fromManifestVersion: sourceVersion,
      dryRun: args.dryRun === true,
      upToDate: writes.length === 0 && existingRemovals.length === 0,
      filesToWrite: writes.map((file) => file.path),
      filesToRemove: existingRemovals,
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
