import { lstatSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, win32 } from "node:path";

const MANAGED_FILES = new Set(["AGENTS.md", "CLAUDE.md", ".harness-manifest.json"]);

/**
 * Files 1.x wrote or edited and 2.0 never touches again: MCP configurations
 * and engine settings holding the Stop hook. A manifest that still lists one
 * drops it with a warning; the file stays in place as the project's.
 */
export const RELEASED_PATHS: ReadonlyArray<string> = [
  ".mcp.json",
  ".codex/config.toml",
  ".opencode/opencode.json",
  ".opencode/mcp.json",
  ".claude/settings.json",
  ".codex/hooks.json",
];

// Includes legacy layouts so upgrades can remove their generated artifacts.
const MANAGED_DIRECTORIES = [
  ".claude/agents/",
  ".claude/commands/",
  ".claude/skills/",
  ".codex/agents/",
  ".codex/commands/",
  ".codex/skills/",
  ".agents/skills/",
  ".opencode/agents/",
  ".opencode/commands/",
  ".opencode/skills/",
  ".opencode/plugins/",
];

function canonicalTargetRoot(root: string): string {
  let ancestor = resolve(root);
  const missing: string[] = [];
  while (!lstatSync(ancestor, { throwIfNoEntry: false })) {
    missing.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  const canonical = realpathSync(ancestor);
  if (!statSync(canonical).isDirectory()) {
    throw new Error(`harness target is not a directory: ${root}`);
  }
  return join(canonical, ...missing);
}

function assertManagedLocation(path: string): void {
  const invalidSegment = path
    .split("/")
    .some((part) => part === "" || part === "." || part === "..");
  if (
    isAbsolute(path) ||
    win32.isAbsolute(path) ||
    path.includes("\\") ||
    path.includes("\0") ||
    invalidSegment
  ) {
    throw new Error(`unsafe harness path: ${path}`);
  }
  if (!MANAGED_FILES.has(path) && !MANAGED_DIRECTORIES.some((prefix) => path.startsWith(prefix))) {
    throw new Error(`path is outside harness-managed locations: ${path}`);
  }
}

function assertNoSymbolicComponents(root: string, path: string): void {
  const parts = path.split("/");
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const info = lstatSync(current, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isSymbolicLink()) {
      throw new Error(`symbolic link in harness path: ${path}`);
    }
    const isLeaf = index === parts.length - 1;
    if (isLeaf ? !info.isFile() : !info.isDirectory()) {
      throw new Error(`unexpected file type in harness path: ${path}`);
    }
  }
}

/**
 * Preflight the complete list before callers mutate any artifact. The target
 * itself may resolve through a symlink; every component below it, including
 * leaf files and the manifest, must be a regular file or directory, never a
 * symlink (even one pointing inside the target). Missing targets are allowed.
 * This checks the current filesystem, not concurrent changes by other processes.
 */
export function assertManagedPaths(root: string, files: ReadonlyArray<string>): void {
  for (const path of files) assertManagedLocation(path);
  const canonicalRoot = canonicalTargetRoot(root);
  for (const path of files) assertNoSymbolicComponents(canonicalRoot, path);
}
