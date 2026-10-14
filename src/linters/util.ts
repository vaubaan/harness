import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";

export function fileExists(repoRoot: string, relativePath: string): boolean {
  return existsSync(join(repoRoot, relativePath));
}

export function readText(repoRoot: string, relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

export function listMarkdown(repoRoot: string, dir: string): string[] {
  const cwd = join(repoRoot, dir);
  if (!existsSync(cwd)) return [];
  return fg
    .sync("**/*.md", { cwd, absolute: false, ignore: ["**/node_modules/**", "**/dist/**"] })
    .filter((f) => !f.endsWith("README.md"))
    .map((f) => join(dir, f));
}

export function listAllMarkdown(repoRoot: string, dir: string): string[] {
  const cwd = join(repoRoot, dir);
  if (!existsSync(cwd)) return [];
  return fg
    .sync("**/*.md", { cwd, absolute: false, ignore: ["**/node_modules/**", "**/dist/**"] })
    .map((f) => join(dir, f));
}

export function dirExists(repoRoot: string, relativePath: string): boolean {
  const full = join(repoRoot, relativePath);
  if (!existsSync(full)) return false;
  return statSync(full).isDirectory();
}

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = matter(text);
  return { data: m.data, body: m.content };
}

export interface GitLogEntry {
  hash: string;
  timestamp: number;
}

export function gitLastCommitForPath(
  repoRoot: string,
  relativePath: string,
): GitLogEntry | undefined {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%H:%ct", "--", relativePath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return undefined;
    const idx = out.indexOf(":");
    if (idx < 0) return undefined;
    const hash = out.slice(0, idx);
    const ts = Number.parseInt(out.slice(idx + 1), 10);
    return { hash, timestamp: ts };
  } catch {
    return undefined;
  }
}

export function gitCommitsSince(
  repoRoot: string,
  relativePath: string,
  sinceCommit: string,
): number {
  try {
    const out = execFileSync(
      "git",
      ["log", `${sinceCommit}..HEAD`, "--format=%H", "--", relativePath],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    if (!out) return 0;
    return out.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function relPath(repoRoot: string, abs: string): string {
  return relative(repoRoot, abs);
}

export function findLineNumber(text: string, needle: string | RegExp): number | undefined {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (typeof needle === "string" ? line.includes(needle) : needle.test(line)) {
      return i + 1;
    }
  }
  return undefined;
}
