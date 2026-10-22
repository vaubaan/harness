import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getRenderer } from "../renderers/index.js";
import type { Engine, RenderedFile } from "../types.js";

/**
 * Engine settings files the Stop hook lives in. A project often owns them
 * already: the harness writes one only when it is absent, or when the
 * manifest records it unchanged. It never merges
 * (docs/decisions/no-mcp-no-code-merge.md).
 */
export const HOOK_CONFIG_PATHS: ReadonlyArray<string> = [
  ".claude/settings.json",
  ".codex/hooks.json",
];

/** Files 1.x edited entry by entry; 2.0 leaves them to the project. */
export const RELEASED_PATHS: ReadonlyArray<string> = [
  ".mcp.json",
  ".codex/config.toml",
  ".opencode/opencode.json",
  ".opencode/mcp.json",
];

/** Substring every rendered Stop hook command contains. */
export const STOP_HOOK_MARKER = "@vaubaan/harness stop-hook";

export interface HookConfigPlan {
  writes: RenderedFile[];
  owned: string[];
  removals: string[];
  warnings: string[];
}

export function isHookConfig(path: string): boolean {
  return HOOK_CONFIG_PATHS.includes(path);
}

export function renderStopHooks(engines: ReadonlyArray<Engine>): {
  files: RenderedFile[];
  warnings: string[];
} {
  const files: RenderedFile[] = [];
  const warnings: string[] = [];
  for (const engine of engines) {
    const result = getRenderer(engine).renderStopHook();
    files.push(...result.files);
    warnings.push(...result.warnings);
  }
  return { files, warnings };
}

/**
 * Decides, for each Stop hook settings file, whether the harness writes it,
 * leaves it to the project with the block to add, or removes one it wrote
 * and no longer needs.
 */
export function planHookConfigs(
  root: string,
  desired: ReadonlyArray<RenderedFile>,
  previousFiles: ReadonlyArray<string>,
  ownedUnchanged: (path: string) => boolean,
): HookConfigPlan {
  const plan: HookConfigPlan = { writes: [], owned: [], removals: [], warnings: [] };
  for (const file of desired) {
    const full = join(root, file.path);
    if (!existsSync(full) || ownedUnchanged(file.path)) {
      plan.writes.push(file);
      plan.owned.push(file.path);
    } else if (readFileSync(full, "utf8").includes(STOP_HOOK_MARKER)) {
      plan.warnings.push(`${file.path} already runs the harness Stop hook and stays yours`);
    } else {
      plan.warnings.push(
        `left ${file.path} unchanged; add this Stop hook to it:\n${file.content.trimEnd()}`,
      );
    }
  }
  const desiredPaths = new Set(desired.map((file) => file.path));
  for (const path of previousFiles) {
    if (!isHookConfig(path) || desiredPaths.has(path) || !existsSync(join(root, path))) continue;
    if (ownedUnchanged(path)) plan.removals.push(path);
    else plan.warnings.push(`kept modified ${path}; it is yours now`);
  }
  return plan;
}
