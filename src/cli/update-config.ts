import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getRenderer } from "../renderers/index.js";
import type { Engine, RenderedFile } from "../types.js";
import { assertManagedPaths } from "./managed-paths.js";
import {
  OPENCODE_CONFIG_PATH,
  type OpenCodeConfigOwnership,
  planOpenCodeConfig,
} from "./opencode-config.js";

const LEGACY_OPENCODE_CONFIG = ".opencode/mcp.json";
export const SHARED_CONFIG_PATHS: ReadonlyArray<string> = [
  ".mcp.json",
  ".codex/config.toml",
  OPENCODE_CONFIG_PATH,
  LEGACY_OPENCODE_CONFIG,
  ".claude/settings.json",
  ".codex/hooks.json",
];

const ObjectSchema = z.record(z.unknown());
const HookEntrySchema = z.object({ group: ObjectSchema, hook: ObjectSchema });
const HookConfigOwnershipSchema = z.object({
  createdFile: z.boolean(),
  addedHooks: z.boolean(),
  addedStop: z.boolean(),
  entries: z.array(HookEntrySchema),
});
export const HookConfigsOwnershipSchema = z
  .object({
    ".claude/settings.json": HookConfigOwnershipSchema.optional(),
    ".codex/hooks.json": HookConfigOwnershipSchema.optional(),
  })
  .strict();
export type HookConfigsOwnership = z.infer<typeof HookConfigsOwnershipSchema>;
type HookConfigOwnership = z.infer<typeof HookConfigOwnershipSchema>;
type HookEntry = z.infer<typeof HookEntrySchema>;
type HookPath = keyof HookConfigsOwnership;

const HOOK_ENGINES: Record<HookPath, Engine> = {
  ".claude/settings.json": "claude-code",
  ".codex/hooks.json": "codex-cli",
};

export interface ConfigMutations {
  writes: RenderedFile[];
  removals: string[];
  warnings: string[];
}

export interface UpdateConfigPrevious {
  files: ReadonlyArray<string>;
  opencodeConfig?: OpenCodeConfigOwnership;
  hookConfigs?: HookConfigsOwnership;
}

export interface UpdateConfigPlan extends ConfigMutations {
  ownedFiles: string[];
  opencodeConfig?: OpenCodeConfigOwnership;
  hookConfigs?: HookConfigsOwnership;
}

function parseObject(content: string, path: string): Record<string, unknown> {
  try {
    return ObjectSchema.parse(JSON.parse(content));
  } catch {
    throw new Error(`invalid shared configuration ${path}: expected a JSON object`);
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  const parsed = ObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function stopHooks(config: Record<string, unknown>, path: string): unknown[] {
  if (!Object.hasOwn(config, "hooks")) return [];
  const hooks = asObject(config.hooks);
  if (!hooks || (Object.hasOwn(hooks, "Stop") && !Array.isArray(hooks.Stop))) {
    throw new Error(`invalid shared configuration ${path}: expected hooks.Stop to be an array`);
  }
  return Array.isArray(hooks.Stop) ? hooks.Stop : [];
}

function groupMetadata(group: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(group).filter(([key]) => key !== "hooks"));
}

function sameEntry(left: HookEntry, right: HookEntry): boolean {
  return isDeepStrictEqual(left.group, right.group) && isDeepStrictEqual(left.hook, right.hook);
}

function appendEntry(entries: HookEntry[], entry: HookEntry): void {
  if (!entries.some((existing) => sameEntry(existing, entry))) entries.push(entry);
}

function defaultStopGroup(engine: Engine): Record<string, unknown> {
  const file = getRenderer(engine).renderStopHook().files[0];
  if (!file) throw new Error(`missing Stop hook renderer for ${engine}`);
  const group = asObject(stopHooks(parseObject(file.content, file.path), file.path)[0]);
  if (!group || !Array.isArray(group.hooks) || !asObject(group.hooks[0])) {
    throw new Error(`invalid Stop hook renderer for ${engine}`);
  }
  return group;
}

function normalizeHarnessHooks(
  groups: unknown[],
  expected: Record<string, unknown>,
  previous: HookConfigOwnership | undefined,
  claimExisting: boolean,
  warnings: string[],
  path: HookPath,
): { groups: unknown[]; entries: HookEntry[] } {
  const defaultHook = ObjectSchema.parse((expected.hooks as unknown[])[0]);
  const entries = [...(previous?.entries ?? [])];
  let found = false;
  const normalized = groups.map((value) => {
    const group = asObject(value);
    if (!group) return value;
    const flat = group.type === "command" && group.command === defaultHook.command;
    const hooks = flat ? [group] : Array.isArray(group.hooks) ? group.hooks : [];
    const metadata = flat ? groupMetadata(expected) : groupMetadata(group);
    for (const value of hooks) {
      const hook = asObject(value);
      if (!hook || hook.type !== "command" || hook.command !== defaultHook.command) continue;
      found = true;
      const entry = { group: metadata, hook };
      if (!claimExisting) continue;
      if (previous && !previous.entries.some((old) => sameEntry(old, entry))) {
        warnings.push(`preserved modified harness Stop hook: ${path}`);
      } else {
        appendEntry(entries, entry);
      }
    }
    return flat && claimExisting ? { ...metadata, hooks: [group] } : value;
  });
  if (!found && !previous?.entries.length) {
    normalized.push(expected);
    appendEntry(entries, { group: groupMetadata(expected), hook: defaultHook });
  } else if (!found) {
    warnings.push(`preserved removed or modified harness Stop hook: ${path}`);
  }
  return { groups: normalized, entries };
}

function removeOwnedHooks(
  config: Record<string, unknown>,
  ownership: HookConfigOwnership,
  path: HookPath,
  warnings: string[],
): void {
  const groups = stopHooks(config, path);
  const remaining: unknown[] = [];
  const matched = new Set<HookEntry>();
  for (const value of groups) {
    const group = asObject(value);
    if (!group || !Array.isArray(group.hooks)) {
      remaining.push(value);
      continue;
    }
    const metadata = groupMetadata(group);
    const hooks = group.hooks.filter((value) => {
      const hook = asObject(value);
      const entry =
        hook && ownership.entries.find((old) => sameEntry(old, { group: metadata, hook }));
      if (entry) matched.add(entry);
      return !entry;
    });
    if (hooks.length > 0 || hooks.length === group.hooks.length) {
      remaining.push({ ...group, hooks });
    }
  }
  if (matched.size < ownership.entries.length) {
    warnings.push(`preserved removed or modified harness Stop hook: ${path}`);
  }
  const hooks = asObject(config.hooks);
  if (!hooks) return;
  if (ownership.addedStop && remaining.length === 0) Reflect.deleteProperty(hooks, "Stop");
  else if (Object.hasOwn(hooks, "Stop")) hooks.Stop = remaining;
  if (ownership.addedHooks && Object.keys(hooks).length === 0)
    Reflect.deleteProperty(config, "hooks");
  else config.hooks = hooks;
}

function recordMutation(
  plan: ConfigMutations,
  path: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  createdFile: boolean,
): void {
  if (createdFile && Object.keys(after).length === 0) {
    if (before) plan.removals.push(path);
  } else if (!isDeepStrictEqual(before, after)) {
    plan.writes.push({ path, content: `${JSON.stringify(after, null, 2)}\n` });
  }
}

export function planHookConfigCleanup(
  root: string,
  ownership: HookConfigsOwnership | undefined,
): ConfigMutations {
  const plan: ConfigMutations = { writes: [], removals: [], warnings: [] };
  if (!ownership) return plan;
  const validated = HookConfigsOwnershipSchema.parse(ownership);
  assertManagedPaths(root, Object.keys(validated));
  for (const path of Object.keys(HOOK_ENGINES) as HookPath[]) {
    const owned = validated[path];
    if (!owned || !existsSync(join(root, path))) continue;
    const before = parseObject(readFileSync(join(root, path), "utf8"), path);
    const config = structuredClone(before);
    removeOwnedHooks(config, owned, path, plan.warnings);
    recordMutation(plan, path, before, config, owned.createdFile);
  }
  return plan;
}

function planActiveHook(
  root: string,
  path: HookPath,
  previous: HookConfigOwnership | undefined,
  claimExisting: boolean,
  plan: UpdateConfigPlan,
): HookConfigOwnership | undefined {
  assertManagedPaths(root, [path]);
  const existed = existsSync(join(root, path));
  if (!existed && previous?.entries.length) {
    plan.warnings.push(`preserved removed harness Stop hook configuration: ${path}`);
    return previous;
  }
  const before = existed ? parseObject(readFileSync(join(root, path), "utf8"), path) : undefined;
  const config = structuredClone(before ?? {});
  const groups = stopHooks(config, path);
  const hooks = asObject(config.hooks) ?? {};
  const normalized = normalizeHarnessHooks(
    groups,
    defaultStopGroup(HOOK_ENGINES[path]),
    previous,
    claimExisting,
    plan.warnings,
    path,
  );
  // Before 1.4.0, init wrote this file whole and listed it in the manifest:
  // the harness created it, along with its hooks and Stop containers.
  const legacyWholeFile = !previous && claimExisting && existed;
  const ownership = {
    createdFile: !existed || previous?.createdFile === true || legacyWholeFile,
    addedHooks: previous?.addedHooks ?? (legacyWholeFile || !Object.hasOwn(config, "hooks")),
    addedStop: previous?.addedStop ?? (legacyWholeFile || !Object.hasOwn(hooks, "Stop")),
    entries: normalized.entries,
  };
  if (!isDeepStrictEqual(groups, normalized.groups)) {
    config.hooks = { ...hooks, Stop: normalized.groups };
  }
  recordMutation(plan, path, before, config, ownership.createdFile);
  return ownership.entries.length > 0 ? ownership : undefined;
}

function planLegacyOpenCode(
  root: string,
  previous: UpdateConfigPrevious,
  plan: UpdateConfigPlan,
): void {
  if (!previous.files.includes(LEGACY_OPENCODE_CONFIG)) return;
  const legacyPath = join(root, LEGACY_OPENCODE_CONFIG);
  if (!existsSync(legacyPath)) return;
  assertManagedPaths(root, [LEGACY_OPENCODE_CONFIG, OPENCODE_CONFIG_PATH]);
  const legacy = parseObject(readFileSync(legacyPath, "utf8"), LEGACY_OPENCODE_CONFIG);
  if (!asObject(legacy.mcp)) {
    throw new Error(
      `invalid shared configuration ${LEGACY_OPENCODE_CONFIG}: expected an MCP object`,
    );
  }
  const merged = planOpenCodeConfig(
    root,
    { path: OPENCODE_CONFIG_PATH, content: JSON.stringify(legacy) },
    undefined,
  );
  if (merged.write) plan.writes.push(merged.write);
  plan.warnings.push(...merged.warnings);
  if (merged.ownership) {
    const old = previous.opencodeConfig;
    plan.opencodeConfig = {
      createdFile: merged.ownership.createdFile || old?.createdFile === true,
      addedMcp: merged.ownership.addedMcp || old?.addedMcp === true,
      addedSchema: merged.ownership.addedSchema || old?.addedSchema === true,
      entries: { ...old?.entries, ...merged.ownership.entries },
    };
  }
  plan.removals.push(LEGACY_OPENCODE_CONFIG);
}

/** Preserve existing MCP settings and plan only shared hook/legacy-layout changes. */
export function planUpdateConfigs(
  root: string,
  previous: UpdateConfigPrevious,
  hookEngines: ReadonlyArray<Engine>,
): UpdateConfigPlan {
  const plan: UpdateConfigPlan = {
    writes: [],
    removals: [],
    ownedFiles: [],
    warnings: [],
    ...(previous.opencodeConfig ? { opencodeConfig: previous.opencodeConfig } : {}),
  };
  planLegacyOpenCode(root, previous, plan);
  const hookConfigs: HookConfigsOwnership = {};
  for (const path of Object.keys(HOOK_ENGINES) as HookPath[]) {
    const owned = previous.hookConfigs?.[path];
    if (hookEngines.includes(HOOK_ENGINES[path])) {
      hookConfigs[path] = planActiveHook(
        root,
        path,
        owned,
        previous.files.includes(path) || Boolean(owned),
        plan,
      );
    } else if (owned) {
      const cleanup = planHookConfigCleanup(root, { [path]: owned });
      plan.writes.push(...cleanup.writes);
      plan.removals.push(...cleanup.removals);
      plan.warnings.push(...cleanup.warnings);
    }
  }
  if (Object.values(hookConfigs).some(Boolean)) plan.hookConfigs = hookConfigs;
  if (hookEngines.includes("opencode")) {
    const plugin = getRenderer("opencode").renderStopHook();
    plan.writes.push(...plugin.files);
    plan.ownedFiles.push(...plugin.files.map((file) => file.path));
    plan.warnings.push(...plugin.warnings);
  }
  return plan;
}
