import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { RenderedFile } from "../types.js";
import { assertManagedPaths } from "./managed-paths.js";

const MANIFEST_PATH = ".harness-manifest.json";
const PRIVATE_FILES = new Set([MANIFEST_PATH]);

type SnapshotEntry =
  | { path: string; exists: false }
  | { path: string; exists: true; mode: number; sha256: string };

function canonicalRoot(root: string): string {
  let ancestor = resolve(root);
  const missing: string[] = [];
  while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
    missing.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  return join(realpathSync(ancestor), ...missing);
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

function assertBackupLocation(root: string, backup: string): void {
  if (contains(root, backup) || contains(backup, root)) {
    throw new Error(`update backup must be outside the target project: ${backup}`);
  }
  const ancestors: string[] = [];
  for (let path = backup; ; path = dirname(path)) {
    ancestors.unshift(path);
    if (dirname(path) === path) break;
  }
  for (const path of ancestors) {
    const info = lstatSync(path, { throwIfNoEntry: false });
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error(`unsafe update backup directory: ${path}`);
    }
  }
  if (lstatSync(backup, { throwIfNoEntry: false })) {
    throw new Error(`update backup directory already exists: ${backup}`);
  }
}

function createDirectories(path: string, created: string[], mode = 0o777): void {
  const missing: string[] = [];
  for (
    let current = path;
    !lstatSync(current, { throwIfNoEntry: false });
    current = dirname(current)
  ) {
    missing.unshift(current);
  }
  for (const directory of missing) {
    mkdirSync(directory, { mode });
    created.push(directory);
  }
}

function writeBackupFile(path: string, content: string | Buffer): void {
  createDirectories(dirname(path), [], 0o700);
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function saveSnapshot(root: string, paths: string[], backup: string): SnapshotEntry[] {
  const entries: SnapshotEntry[] = [];
  createDirectories(dirname(backup), [], 0o700);
  mkdirSync(backup, { mode: 0o700 });
  for (const path of paths) {
    const full = join(root, path);
    const info = lstatSync(full, { throwIfNoEntry: false });
    if (!info) {
      entries.push({ path, exists: false });
      continue;
    }
    const content = readFileSync(full);
    writeBackupFile(join(backup, "files", path), content);
    entries.push({
      path,
      exists: true,
      mode: info.mode & 0o7777,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  writeBackupFile(
    join(backup, "snapshot.json"),
    `${JSON.stringify({ version: 1, root, createdAt: new Date().toISOString(), entries }, null, 2)}\n`,
  );
  return entries;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rollback(
  root: string,
  backup: string,
  entries: ReadonlyMap<string, SnapshotEntry>,
  touched: Set<string>,
  createdDirectories: string[],
): string[] {
  const errors: string[] = [];
  for (const path of [...touched].reverse()) {
    try {
      assertManagedPaths(root, [path]);
      const entry = entries.get(path);
      const full = join(root, path);
      const current = lstatSync(full, { throwIfNoEntry: false });
      if (!entry?.exists) {
        if (current) unlinkSync(full);
        continue;
      }
      const original = readFileSync(join(backup, "files", path));
      if (!current || !readFileSync(full).equals(original)) {
        // Recreate the file to restore even an original read-only mode.
        if (current) unlinkSync(full);
        writeFileSync(full, original, { mode: 0o600 });
      }
      chmodSync(full, entry.mode);
    } catch (error) {
      errors.push(`${path}: ${errorMessage(error)}`);
    }
  }
  for (const directory of [...createdDirectories].reverse()) {
    try {
      if (readdirSync(directory).length === 0) rmdirSync(directory);
    } catch (error) {
      errors.push(`${directory}: ${errorMessage(error)}`);
    }
  }
  return errors;
}

/**
 * Apply an already planned update, preserving the caller's write order (the
 * manifest belongs last). Backups are new, private directories outside the
 * project. The complete batch is validated before backup or project mutation.
 */
export function applyUpdateTransaction(
  root: string,
  writes: ReadonlyArray<RenderedFile>,
  removals: ReadonlyArray<string>,
  backupDir?: string,
): { backupDir: string } {
  const paths = [...new Set([...removals, ...writes.map((file) => file.path)])];
  assertManagedPaths(root, paths);
  const target = canonicalRoot(root);
  const backup = resolve(
    backupDir ?? join(homedir(), ".local", "state", "vaubaan-harness", "backups", randomUUID()),
  );
  assertBackupLocation(target, backup);
  let snapshot: SnapshotEntry[];
  try {
    snapshot = saveSnapshot(target, paths, backup);
  } catch (error) {
    throw new Error(
      `could not prepare update backup at ${backup}; project unchanged: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  const entries = new Map(snapshot.map((entry) => [entry.path, entry]));
  const touched = new Set<string>();
  const createdDirectories: string[] = [];
  try {
    assertManagedPaths(target, paths);
    for (const path of removals) {
      if (!lstatSync(join(target, path), { throwIfNoEntry: false })) continue;
      touched.add(path);
      unlinkSync(join(target, path));
    }
    for (const file of writes) {
      const full = join(target, file.path);
      createDirectories(dirname(full), createdDirectories);
      touched.add(file.path);
      const entry = entries.get(file.path);
      const mode =
        file.path === MANIFEST_PATH
          ? 0o600
          : entry?.exists
            ? entry.mode
            : PRIVATE_FILES.has(file.path)
              ? 0o600
              : 0o644;
      // Ownership snapshots may include private settings. Restrict an existing
      // manifest before writing those bytes, and restore its old mode on failure.
      if (entry?.exists && file.path === MANIFEST_PATH) chmodSync(full, mode);
      writeFileSync(full, file.content, { mode });
      if (entry?.exists) chmodSync(full, mode);
    }
  } catch (error) {
    const failures = rollback(target, backup, entries, touched, createdDirectories);
    const restoration =
      failures.length > 0 ? `rollback errors: ${failures.join("; ")}` : "rollback completed";
    throw new Error(`update failed; backup: ${backup}; ${restoration}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  return { backupDir: backup };
}
