import {
  existsSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, hashContent, manifestPath, readManifest } from "./manifest.js";
import {
  CLAUDE_MCP_PATH,
  OPENCODE_CONFIG_PATH,
  planClaudeMcpConfig,
  planOpenCodeConfig,
} from "./opencode-config.js";
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
    ...(manifest.mcpConfig ? [CLAUDE_MCP_PATH] : []),
    ...Object.keys(manifest.hookConfigs ?? {}),
  ]);
  const config = planOpenCodeConfig(root, undefined, manifest.opencodeConfig);
  const mcp = planClaudeMcpConfig(root, undefined, manifest.mcpConfig);
  const hooks = planHookConfigCleanup(root, manifest.hookConfigs);
  const sharedHooks = new Set(Object.keys(manifest.hookConfigs ?? {}));
  // A generated file edited since the harness wrote it now belongs to the user.
  const modified = manifest.files.filter((file) => {
    const hash = manifest.fileHashes?.[file];
    const full = join(root, file);
    return hash !== undefined && existsSync(full) && hashContent(readFileSync(full)) !== hash;
  });
  const ownedFiles = manifest.files.filter(
    (file) =>
      file !== OPENCODE_CONFIG_PATH &&
      !(manifest.mcpConfig && file === CLAUDE_MCP_PATH) &&
      !sharedHooks.has(file) &&
      !modified.includes(file),
  );
  if (config.remove) ownedFiles.push(OPENCODE_CONFIG_PATH);
  if (mcp.remove) ownedFiles.push(CLAUDE_MCP_PATH);
  ownedFiles.push(...hooks.removals);
  const { filesRemoved, dirsPruned, missing } = removeRenderedFiles(root, ownedFiles);
  for (const file of [config.write, mcp.write, ...hooks.writes]) {
    if (file) writeFileSync(join(root, file.path), file.content);
  }
  warnings.push(...config.warnings, ...mcp.warnings, ...hooks.warnings);
  for (const file of modified) warnings.push(`kept modified harness file: ${file}`);
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

export function pruneEmptyDirs(root: string, leaves: Set<string>): string[] {
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
