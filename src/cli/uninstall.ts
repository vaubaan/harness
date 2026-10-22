import { existsSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { RELEASED_PATHS, assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, hashContent, manifestPath, readManifest } from "./manifest.js";

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

  // Files 1.x edited entry by entry are the project's now; they stay.
  const released = manifest.files.filter((file) => RELEASED_PATHS.includes(file));
  const files = manifest.files.filter((file) => !released.includes(file));
  assertManagedPaths(root, files);
  // A generated file edited since the harness wrote it now belongs to the user.
  const modified = files.filter((file) => {
    const hash = manifest.fileHashes?.[file];
    const full = join(root, file);
    return hash !== undefined && existsSync(full) && hashContent(readFileSync(full)) !== hash;
  });
  const ownedFiles = files.filter((file) => !modified.includes(file));
  const { filesRemoved, dirsPruned, missing } = removeRenderedFiles(root, ownedFiles);
  for (const file of released) {
    warnings.push(`no longer managed by the harness, left in place: ${file}`);
  }
  for (const file of modified) warnings.push(`kept modified harness file: ${file}`);
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
