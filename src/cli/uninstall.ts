import { existsSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, manifestPath, readManifest } from "./manifest.js";
import { OPENCODE_CONFIG_PATH, planOpenCodeConfig } from "./opencode-config.js";
import { planHookConfigCleanup } from "./update-config.js";

export interface UninstallArgs {
  targetDir: string;
}

export interface UninstallResult {
  filesRemoved: string[];
  dirsPruned: string[];
  warnings: string[];
}

export function uninstallCommand(args: UninstallArgs): UninstallResult {
  const root = resolve(args.targetDir);
  const warnings: string[] = [];
  assertManagedPaths(root, [MANIFEST_FILENAME]);
  const manifest = readManifest(root);
  if (!manifest) {
    warnings.push(`no manifest found at ${manifestPath(root)} — nothing to uninstall`);
    return { filesRemoved: [], dirsPruned: [], warnings };
  }

  assertManagedPaths(root, [
    ...manifest.files,
    ...(manifest.opencodeConfig ? [OPENCODE_CONFIG_PATH] : []),
    ...Object.keys(manifest.hookConfigs ?? {}),
  ]);
  const config = planOpenCodeConfig(root, undefined, manifest.opencodeConfig);
  const hooks = planHookConfigCleanup(root, manifest.hookConfigs);
  const sharedHooks = new Set(Object.keys(manifest.hookConfigs ?? {}));
  const ownedFiles = manifest.files.filter(
    (file) => file !== OPENCODE_CONFIG_PATH && !sharedHooks.has(file),
  );
  if (config.remove) ownedFiles.push(OPENCODE_CONFIG_PATH);
  ownedFiles.push(...hooks.removals);
  const { filesRemoved, dirsPruned, missing } = removeRenderedFiles(root, ownedFiles);
  if (config.write) writeFileSync(join(root, config.write.path), config.write.content);
  for (const file of hooks.writes) writeFileSync(join(root, file.path), file.content);
  warnings.push(...config.warnings, ...hooks.warnings);
  if (manifest.files.includes(OPENCODE_CONFIG_PATH) && !manifest.opencodeConfig) {
    warnings.push(`preserved legacy shared configuration: ${OPENCODE_CONFIG_PATH}`);
  }
  for (const rel of missing) warnings.push(`file in manifest is already missing: ${rel}`);

  unlinkSync(manifestPath(root));
  return { filesRemoved, dirsPruned, warnings };
}

export function removeRenderedFiles(
  root: string,
  files: ReadonlyArray<string>,
): { filesRemoved: string[]; dirsPruned: string[]; missing: string[] } {
  assertManagedPaths(root, files);
  const filesRemoved: string[] = [];
  const missing: string[] = [];
  const dirsToConsider = new Set<string>();
  for (const rel of files) {
    const full = join(root, rel);
    if (existsSync(full)) {
      unlinkSync(full);
      filesRemoved.push(rel);
      dirsToConsider.add(dirname(full));
    } else {
      missing.push(rel);
    }
  }
  return { filesRemoved, dirsPruned: pruneEmptyDirs(root, dirsToConsider), missing };
}

function pruneEmptyDirs(root: string, leaves: Set<string>): string[] {
  const candidates = new Set<string>();
  for (const leaf of leaves) {
    let cur = leaf;
    while (cur !== root && cur.startsWith(`${root}/`)) {
      candidates.add(cur);
      cur = dirname(cur);
    }
  }
  const pruned: string[] = [];
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  for (const dir of sorted) {
    if (!existsSync(dir)) continue;
    if (readdirSync(dir).length > 0) continue;
    rmdirSync(dir);
    pruned.push(relative(root, dir));
  }
  return pruned;
}
