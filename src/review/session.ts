/**
 * A review session's files under `.vaubaan/review/` (docs/spec/coding-agent-harness.md
 * §10.4, decision review-loop): the snapshot of `docs/` and `README.md`, the
 * graph at the start, the session state that only the server writes, the
 * archive of ended sessions.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import fg from "fast-glob";
import type { JournalEntry, Thread } from "../view/html.js";

export const REVIEW_DIR = ".vaubaan/review";
/** What a session snapshots and `discard` restores; nothing else is touched. */
export const REVIEWED_GLOBS = ["README.md", "docs/**"];

export interface ServerInfo {
  pid: number;
  port: number;
  host: string;
  token: string;
  url: string;
}

export interface SessionState {
  version: 1;
  id: string;
  startedAt: string;
  status: "live" | "ended" | "kept" | "discarded";
  /** Path → sha256 of every snapshotted file. */
  snapshot: Record<string, string>;
  batch: number;
  /** Last batch handed to the agent by `review next`. */
  delivered: number;
  threads: Thread[];
  journal: JournalEntry[];
}

export function reviewPath(root: string, ...parts: string[]): string {
  return join(root, REVIEW_DIR, ...parts);
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** The reviewed files of the working tree, sorted. */
export function reviewedFiles(root: string): string[] {
  return fg.sync(REVIEWED_GLOBS, { cwd: root, dot: true, onlyFiles: true }).sort();
}

export function newSessionId(): string {
  return randomBytes(3).toString("hex");
}

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

/** Copies `docs/` and `README.md` into the session's snapshot, untracked files included. */
export function takeSnapshot(root: string): Record<string, string> {
  const dir = reviewPath(root, "snapshot");
  rmSync(dir, { recursive: true, force: true });
  const hashes: Record<string, string> = {};
  for (const file of reviewedFiles(root)) {
    const target = join(dir, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, file), target);
    hashes[file] = sha256(join(root, file));
  }
  return hashes;
}

export interface Changes {
  modified: string[];
  created: string[];
  deleted: string[];
}

/** What changed in `docs/` and `README.md` since the snapshot. */
export function changesSince(root: string, snapshot: Record<string, string>): Changes {
  const now = new Set(reviewedFiles(root));
  const modified: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];
  for (const file of now) {
    const before = snapshot[file];
    if (before === undefined) created.push(file);
    else if (before !== sha256(join(root, file))) modified.push(file);
  }
  for (const file of Object.keys(snapshot)) if (!now.has(file)) deleted.push(file);
  return { modified: modified.sort(), created: created.sort(), deleted: deleted.sort() };
}

function pruneEmptyDirs(dir: string, keep: Set<string>, root: string): void {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const entry of readdirSync(dir)) pruneEmptyDirs(join(dir, entry), keep, root);
  const rel = dir.slice(root.length + 1);
  if (rel && !keep.has(rel) && readdirSync(dir).length === 0) rmdirSync(dir);
}

/** Puts `docs/` and `README.md` back as the snapshot holds them, byte for byte. */
export function restoreSnapshot(root: string, snapshot: Record<string, string>): Changes {
  const changes = changesSince(root, snapshot);
  const dir = reviewPath(root, "snapshot");
  for (const file of changes.created) rmSync(join(root, file), { force: true });
  for (const file of [...changes.modified, ...changes.deleted]) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(dir, file), target);
  }
  const keepDirs = new Set<string>();
  for (const file of Object.keys(snapshot)) {
    let d = dirname(file);
    while (d && d !== ".") {
      keepDirs.add(d);
      d = dirname(d);
    }
  }
  pruneEmptyDirs(join(root, "docs"), keepDirs, root);
  return changes;
}

export function readSession(root: string): SessionState | undefined {
  const path = reviewPath(root, "session.json");
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as SessionState;
}

/** Atomic write: the server is the only writer, a reader never sees half a file. */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

export function writeSession(root: string, state: SessionState): void {
  writeJson(reviewPath(root, "session.json"), state);
}

export function readServerInfo(root: string): ServerInfo | undefined {
  const path = reviewPath(root, "server.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ServerInfo;
  } catch {
    return undefined;
  }
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Moves the ended session to the archive the lessons read, and clears the live files. */
export function archiveSession(
  root: string,
  state: SessionState,
  outcome: "kept" | "discarded",
): string {
  const path = reviewPath(root, "archive", `${state.startedAt.slice(0, 10)}-${state.id}.json`);
  writeJson(path, {
    ...state,
    status: outcome,
    endedAt: new Date().toISOString(),
    snapshot: undefined,
  });
  for (const f of ["session.json", "server.json", "base.graph.json"])
    rmSync(reviewPath(root, f), { force: true });
  rmSync(reviewPath(root, "snapshot"), { recursive: true, force: true });
  return path;
}
