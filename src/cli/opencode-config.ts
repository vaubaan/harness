import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { RenderedFile } from "../types.js";

export const OPENCODE_CONFIG_PATH = ".opencode/opencode.json";
const OPENCODE_SCHEMA = "https://opencode.ai/config.json";
const ObjectSchema = z.record(z.unknown());

export const OpenCodeConfigOwnershipSchema = z.object({
  createdFile: z.boolean(),
  addedMcp: z.boolean(),
  addedSchema: z.boolean(),
  entries: z.record(ObjectSchema),
});

export type OpenCodeConfigOwnership = z.infer<typeof OpenCodeConfigOwnershipSchema>;

export interface OpenCodeConfigPlan {
  write?: RenderedFile;
  remove: boolean;
  ownership?: OpenCodeConfigOwnership;
  warnings: string[];
}

function parseConfig(content: string): Record<string, unknown> {
  try {
    const config = ObjectSchema.parse(JSON.parse(content));
    if (Object.hasOwn(config, "mcp")) ObjectSchema.parse(config.mcp);
    return config;
  } catch {
    throw new Error(`invalid ${OPENCODE_CONFIG_PATH}: expected a JSON object with an MCP object`);
  }
}

function removeOwnedEntries(
  config: Record<string, unknown>,
  ownership: OpenCodeConfigOwnership,
  warnings: string[],
): void {
  if (Object.hasOwn(config, "mcp")) {
    const mcp = ObjectSchema.parse(config.mcp);
    for (const [id, installed] of Object.entries(ownership.entries)) {
      if (!Object.hasOwn(mcp, id)) continue;
      if (isDeepStrictEqual(mcp[id], installed)) delete mcp[id];
      else warnings.push(`preserved modified OpenCode MCP server: ${id}`);
    }
    config.mcp = mcp;
    if (ownership.addedMcp && Object.keys(mcp).length === 0) Reflect.deleteProperty(config, "mcp");
  }
  if (ownership.addedSchema && config.$schema === OPENCODE_SCHEMA)
    Reflect.deleteProperty(config, "$schema");
}

function addMissingEntries(
  config: Record<string, unknown>,
  desired: RenderedFile,
  createdFile: boolean,
  warnings: string[],
): OpenCodeConfigOwnership | undefined {
  const requested = ObjectSchema.parse(parseConfig(desired.content).mcp);
  const mcp = ObjectSchema.parse(config.mcp ?? {});
  const entries: Record<string, Record<string, unknown>> = {};
  for (const [id, entry] of Object.entries(requested)) {
    if (Object.hasOwn(mcp, id)) {
      if (!isDeepStrictEqual(mcp[id], entry)) {
        warnings.push(`preserved existing OpenCode MCP server instead of replacing it: ${id}`);
      }
      continue;
    }
    entries[id] = ObjectSchema.parse(entry);
    mcp[id] = entry;
  }
  if (Object.keys(entries).length === 0) return undefined;
  const ownership = {
    createdFile,
    addedMcp: !Object.hasOwn(config, "mcp"),
    addedSchema: !Object.hasOwn(config, "$schema"),
    entries,
  };
  config.mcp = mcp;
  if (ownership.addedSchema) config.$schema = OPENCODE_SCHEMA;
  return ownership;
}

/** Plans shared configuration edits before init/uninstall mutate any project files. */
export function planOpenCodeConfig(
  root: string,
  desired: RenderedFile | undefined,
  previous: OpenCodeConfigOwnership | undefined,
): OpenCodeConfigPlan {
  const warnings: string[] = [];
  if (!desired && !previous) return { remove: false, warnings };
  const path = join(root, OPENCODE_CONFIG_PATH);
  const existed = existsSync(path);
  if (!existed && !desired) return { remove: false, warnings };
  const original = existed ? readFileSync(path, "utf8") : undefined;
  const config = original === undefined ? {} : parseConfig(original);
  const before = structuredClone(config);
  if (previous) removeOwnedEntries(config, previous, warnings);
  const createdFile = !existed || previous?.createdFile === true;
  const ownership = desired ? addMissingEntries(config, desired, createdFile, warnings) : undefined;
  if (!ownership && createdFile && Object.keys(config).length === 0) {
    return { remove: existed, warnings };
  }
  return {
    remove: false,
    ownership,
    warnings,
    ...(!existed || !isDeepStrictEqual(before, config)
      ? { write: { path: OPENCODE_CONFIG_PATH, content: `${JSON.stringify(config, null, 2)}\n` } }
      : {}),
  };
}
