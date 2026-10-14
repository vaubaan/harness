import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { RenderedFile } from "../types.js";

export const OPENCODE_CONFIG_PATH = ".opencode/opencode.json";
export const CLAUDE_MCP_PATH = ".mcp.json";
const OPENCODE_SCHEMA = "https://opencode.ai/config.json";
const ObjectSchema = z.record(z.unknown());

/** A JSON file holding MCP servers under one key, shared with the user. */
interface McpJsonTarget {
  path: string;
  key: string;
  label: string;
  schema?: string;
}

const OPENCODE_TARGET: McpJsonTarget = {
  path: OPENCODE_CONFIG_PATH,
  key: "mcp",
  label: "OpenCode",
  schema: OPENCODE_SCHEMA,
};
const CLAUDE_TARGET: McpJsonTarget = {
  path: CLAUDE_MCP_PATH,
  key: "mcpServers",
  label: "Claude Code",
};

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

function parseConfig(target: McpJsonTarget, content: string): Record<string, unknown> {
  try {
    const config = ObjectSchema.parse(JSON.parse(content));
    if (Object.hasOwn(config, target.key)) ObjectSchema.parse(config[target.key]);
    return config;
  } catch {
    throw new Error(`invalid ${target.path}: expected a JSON object with an MCP object`);
  }
}

function removeOwnedEntries(
  target: McpJsonTarget,
  config: Record<string, unknown>,
  ownership: OpenCodeConfigOwnership,
  warnings: string[],
): void {
  if (Object.hasOwn(config, target.key)) {
    const mcp = ObjectSchema.parse(config[target.key]);
    for (const [id, installed] of Object.entries(ownership.entries)) {
      if (!Object.hasOwn(mcp, id)) continue;
      if (isDeepStrictEqual(mcp[id], installed)) delete mcp[id];
      else warnings.push(`preserved modified ${target.label} MCP server: ${id}`);
    }
    config[target.key] = mcp;
    if (ownership.addedMcp && Object.keys(mcp).length === 0)
      Reflect.deleteProperty(config, target.key);
  }
  if (target.schema && ownership.addedSchema && config.$schema === target.schema)
    Reflect.deleteProperty(config, "$schema");
}

function addMissingEntries(
  target: McpJsonTarget,
  config: Record<string, unknown>,
  desired: RenderedFile,
  createdFile: boolean,
  warnings: string[],
): OpenCodeConfigOwnership | undefined {
  const requested = ObjectSchema.parse(parseConfig(target, desired.content)[target.key]);
  const mcp = ObjectSchema.parse(config[target.key] ?? {});
  const entries: Record<string, Record<string, unknown>> = {};
  for (const [id, entry] of Object.entries(requested)) {
    if (Object.hasOwn(mcp, id)) {
      if (!isDeepStrictEqual(mcp[id], entry)) {
        warnings.push(
          `preserved existing ${target.label} MCP server instead of replacing it: ${id}`,
        );
      }
      continue;
    }
    entries[id] = ObjectSchema.parse(entry);
    mcp[id] = entry;
  }
  if (Object.keys(entries).length === 0) return undefined;
  const ownership = {
    createdFile,
    addedMcp: !Object.hasOwn(config, target.key),
    addedSchema: target.schema !== undefined && !Object.hasOwn(config, "$schema"),
    entries,
  };
  config[target.key] = mcp;
  if (target.schema && ownership.addedSchema) config.$schema = target.schema;
  return ownership;
}

function planMcpJson(
  target: McpJsonTarget,
  root: string,
  desired: RenderedFile | undefined,
  previous: OpenCodeConfigOwnership | undefined,
): OpenCodeConfigPlan {
  const warnings: string[] = [];
  if (!desired && !previous) return { remove: false, warnings };
  const path = join(root, target.path);
  const existed = existsSync(path);
  if (!existed && !desired) return { remove: false, warnings };
  const original = existed ? readFileSync(path, "utf8") : undefined;
  const config = original === undefined ? {} : parseConfig(target, original);
  const before = structuredClone(config);
  if (previous) removeOwnedEntries(target, config, previous, warnings);
  const createdFile = !existed || previous?.createdFile === true;
  const ownership = desired
    ? addMissingEntries(target, config, desired, createdFile, warnings)
    : undefined;
  if (!ownership && createdFile && Object.keys(config).length === 0) {
    return { remove: existed, warnings };
  }
  return {
    remove: false,
    ownership,
    warnings,
    ...(!existed || !isDeepStrictEqual(before, config)
      ? { write: { path: target.path, content: `${JSON.stringify(config, null, 2)}\n` } }
      : {}),
  };
}

/** Plans shared configuration edits before init/uninstall mutate any project files. */
export function planOpenCodeConfig(
  root: string,
  desired: RenderedFile | undefined,
  previous: OpenCodeConfigOwnership | undefined,
): OpenCodeConfigPlan {
  return planMcpJson(OPENCODE_TARGET, root, desired, previous);
}

/** Same entry-level ownership for Claude Code's `.mcp.json` (`mcpServers`). */
export function planClaudeMcpConfig(
  root: string,
  desired: RenderedFile | undefined,
  previous: OpenCodeConfigOwnership | undefined,
): OpenCodeConfigPlan {
  return planMcpJson(CLAUDE_TARGET, root, desired, previous);
}
