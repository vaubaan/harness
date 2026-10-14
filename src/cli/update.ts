import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DisableYamlSchema } from "../loader.js";
import type { Engine, RenderedFile } from "../types.js";
import { parseYAML } from "../util/yaml.js";
import { VERSION } from "../version.js";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, MANIFEST_VERSION, type Manifest, hashContent } from "./manifest.js";
import {
  CLAUDE_MCP_PATH,
  OPENCODE_CONFIG_PATH,
  type OpenCodeConfigOwnership,
  planClaudeMcpConfig,
  planOpenCodeConfig,
} from "./opencode-config.js";
import { planInit } from "./plan-render.js";
import { SHARED_CONFIG_PATHS, planUpdateConfigs } from "./update-config.js";
import { readUpdateInstallation } from "./update-manifest.js";
import { applyUpdateTransaction } from "./update-transaction.js";

const CODEX_CONFIG_PATH = ".codex/config.toml";

export interface UpdateArgs {
  targetDir: string;
  packageDir?: string;
  overridesDir?: string;
  preserveFiles?: ReadonlyArray<string>;
  dryRun?: boolean;
  /** Exact new backup directory, outside the project. Defaults to private user state. */
  backupDir?: string;
}

export interface UpdateResult {
  version: string;
  fromManifestVersion: string;
  dryRun: boolean;
  upToDate: boolean;
  filesToWrite: string[];
  filesToRemove: string[];
  warnings: string[];
  backupDir?: string;
}

export interface UpdatePlan {
  writes: RenderedFile[];
  removals: string[];
  /** Generated files the harness owns after this plan, as recorded in the manifest. */
  owned: string[];
  result: UpdateResult;
}

/** What to install: `update` reads it from the manifest, `init` from its options. */
export interface InstallationSettings {
  previous: Manifest;
  sourceVersion: string;
  engines: Engine[];
  hookEngines: Engine[];
  /** MCP servers to install. Undefined keeps the MCP state recorded by a previous run. */
  mcpServers?: ReadonlyArray<string>;
}

interface McpPlan {
  writes: RenderedFile[];
  removals: string[];
  owned: string[];
  /** False when the OpenCode file was left to the legacy migration of this run. */
  plannedOpenCode: boolean;
  opencodeConfig?: OpenCodeConfigOwnership;
  mcpConfig?: OpenCodeConfigOwnership;
  warnings: string[];
}

function currentContent(root: string, path: string): string | undefined {
  return existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined;
}

/** True when the manifest lists `path` and the file still has the content the harness wrote. */
function ownedUnchanged(root: string, previous: Manifest, path: string): boolean {
  const content = currentContent(root, path);
  if (content === undefined || !previous.files.includes(path)) return false;
  const hash = previous.fileHashes?.[path];
  return hash === undefined || hash === hashContent(content);
}

/** Collects every conflict before failing, so one run lists all files to resolve. */
function checkArtifactConflicts(
  root: string,
  previous: Manifest,
  writes: ReadonlyArray<RenderedFile>,
  removals: ReadonlyArray<string>,
): void {
  const desired = new Map(writes.map((file) => [file.path, file.content]));
  const conflicts: string[] = [];
  for (const path of [...desired.keys(), ...removals]) {
    if (SHARED_CONFIG_PATHS.includes(path)) continue;
    const content = currentContent(root, path);
    if (content === undefined || content === desired.get(path)) continue;
    if (!previous.files.includes(path)) {
      conflicts.push(`existing file outside harness manifest: ${path}`);
      continue;
    }
    const hash = previous.fileHashes?.[path];
    if (hash && hash !== hashContent(content)) conflicts.push(`modified harness file: ${path}`);
  }
  if (conflicts.length) {
    throw new Error(
      `${conflicts.join("\n")}\nmove their content to docs/ or .harness-overrides/, or keep them as yours with --preserve <path>`,
    );
  }
}

/** Before 1.4.0, `init` recorded `.mcp.json` as a whole harness file. */
function legacyMcpOwnership(root: string, previous: Manifest): OpenCodeConfigOwnership | undefined {
  if (!ownedUnchanged(root, previous, CLAUDE_MCP_PATH)) return undefined;
  try {
    const servers = JSON.parse(currentContent(root, CLAUDE_MCP_PATH) ?? "").mcpServers;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) return undefined;
    return { createdFile: true, addedMcp: true, addedSchema: false, entries: servers };
  } catch {
    return undefined;
  }
}

function planMcp(
  root: string,
  settings: InstallationSettings,
  rendered: ReadonlyArray<RenderedFile>,
  pendingWrites: ReadonlyArray<RenderedFile>,
): McpPlan {
  const { previous } = settings;
  const plan: McpPlan = {
    writes: [],
    removals: [],
    owned: [],
    plannedOpenCode: false,
    warnings: [],
  };
  const claudeOwnership = previous.mcpConfig ?? legacyMcpOwnership(root, previous);
  const codexOwned = ownedUnchanged(root, previous, CODEX_CONFIG_PATH);
  if (settings.mcpServers === undefined) {
    // update keeps the MCP servers recorded by the last init.
    if (codexOwned) plan.owned.push(CODEX_CONFIG_PATH);
    plan.mcpConfig = claudeOwnership;
    return plan;
  }
  const desired = (path: string) => rendered.find((file) => file.path === path);
  // A legacy `.opencode/mcp.json` migrated in this run already wrote the file.
  if (!pendingWrites.some((file) => file.path === OPENCODE_CONFIG_PATH)) {
    plan.plannedOpenCode = true;
    if (previous.files.includes(OPENCODE_CONFIG_PATH) && !previous.opencodeConfig) {
      plan.warnings.push(`preserved legacy shared configuration: ${OPENCODE_CONFIG_PATH}`);
    }
    const opencode = planOpenCodeConfig(
      root,
      desired(OPENCODE_CONFIG_PATH),
      previous.opencodeConfig,
    );
    if (opencode.write) plan.writes.push(opencode.write);
    if (opencode.remove) plan.removals.push(OPENCODE_CONFIG_PATH);
    plan.opencodeConfig = opencode.ownership;
    plan.warnings.push(...opencode.warnings);
  }
  const claude = planClaudeMcpConfig(root, desired(CLAUDE_MCP_PATH), claudeOwnership);
  if (claude.write) plan.writes.push(claude.write);
  if (claude.remove) plan.removals.push(CLAUDE_MCP_PATH);
  plan.mcpConfig = claude.ownership;
  plan.warnings.push(...claude.warnings);
  const codex = desired(CODEX_CONFIG_PATH);
  const codexExists = existsSync(join(root, CODEX_CONFIG_PATH));
  if (codex && (!codexExists || codexOwned)) {
    plan.writes.push(codex);
    plan.owned.push(CODEX_CONFIG_PATH);
  } else if (codex) {
    plan.warnings.push(
      `left ${CODEX_CONFIG_PATH} unchanged; add this block to it to enable MCP in Codex:\n${codex.content.trimEnd()}`,
    );
  } else if (codexOwned) {
    plan.removals.push(CODEX_CONFIG_PATH);
  }
  return plan;
}

/** All reads and validation precede backup creation and project mutations. */
export function planInstallation(
  args: Omit<UpdateArgs, "dryRun" | "backupDir">,
  settings: InstallationSettings,
): Omit<UpdatePlan, "result"> & { manifest: Manifest; warnings: string[] } {
  const root = resolve(args.targetDir);
  const { previous, engines, hookEngines } = settings;
  const preserved = [
    ...new Set([...(previous.preservedFiles ?? []), ...(args.preserveFiles ?? [])]),
  ].sort();
  if (preserved.includes(MANIFEST_FILENAME))
    throw new Error("cannot preserve the harness manifest");
  if (preserved.some((path) => SHARED_CONFIG_PATHS.includes(path))) {
    throw new Error(
      "--preserve applies to generated artifacts; shared configurations use entry-level preservation",
    );
  }
  assertManagedPaths(root, [...previous.files, ...preserved, ...SHARED_CONFIG_PATHS]);
  const requestedOverrides = args.overridesDir ?? previous.overridesDir;
  const overridesDir = args.overridesDir
    ? resolve(args.overridesDir)
    : previous.overridesDir
      ? resolve(root, previous.overridesDir)
      : root;
  if (requestedOverrides && !existsSync(join(overridesDir, ".harness-overrides"))) {
    throw new Error(`recorded overrides are missing: ${overridesDir}/.harness-overrides`);
  }
  const hasOverrides = existsSync(join(overridesDir, ".harness-overrides"));
  const disablePath = join(overridesDir, ".harness-overrides", "disable.yaml");
  if (existsSync(disablePath)) {
    try {
      DisableYamlSchema.parse(parseYAML(readFileSync(disablePath, "utf8")));
    } catch {
      throw new Error(`invalid override selection: ${disablePath}`);
    }
  }
  const rendered = planInit({
    targetDir: root,
    packageDir: args.packageDir,
    engines,
    overridesDir: hasOverrides ? overridesDir : undefined,
    mcpServers: settings.mcpServers,
    withStopHook: false,
  });
  const generated = rendered.output.files.filter(
    (file) => !SHARED_CONFIG_PATHS.includes(file.path),
  );
  const config = planUpdateConfigs(root, previous, hookEngines);
  const mcp = planMcp(root, settings, rendered.output.files, config.writes);
  const output = [...generated, ...config.writes, ...mcp.writes].filter(
    (file) => !preserved.includes(file.path),
  );
  const owned = [
    ...new Set([...generated.map((file) => file.path), ...config.ownedFiles, ...mcp.owned]),
  ]
    .filter((file) => !preserved.includes(file))
    .sort();
  const removals = [
    ...new Set([
      ...previous.files.filter(
        (file) => !owned.includes(file) && !SHARED_CONFIG_PATHS.includes(file),
      ),
      ...config.removals,
      ...mcp.removals,
    ]),
  ].filter((file) => !preserved.includes(file));
  assertManagedPaths(root, [...output.map((file) => file.path), ...removals]);
  checkArtifactConflicts(root, previous, output, removals);
  const hashes = Object.fromEntries(
    owned.map((path) => {
      const content =
        output.find((file) => file.path === path)?.content ?? currentContent(root, path);
      if (content === undefined) throw new Error(`missing planned harness file: ${path}`);
      return [path, hashContent(content)];
    }),
  );
  const opencodeConfig = mcp.plannedOpenCode ? mcp.opencodeConfig : config.opencodeConfig;
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    harnessVersion: VERSION,
    engines: [...engines].sort(),
    renderedAt: previous.renderedAt,
    files: owned,
    fileHashes: hashes,
    stopHookInstalled: hookEngines.length > 0,
    stopHookEngines: [...hookEngines].sort(),
    ...(hasOverrides ? { overridesDir: overridesDir === root ? "." : overridesDir } : {}),
    ...(preserved.length ? { preservedFiles: preserved } : {}),
    ...(opencodeConfig ? { opencodeConfig } : {}),
    ...(mcp.mcpConfig ? { mcpConfig: mcp.mcpConfig } : {}),
    ...(config.hookConfigs ? { hookConfigs: config.hookConfigs } : {}),
  };
  const writes = output.filter((file) => currentContent(root, file.path) !== file.content);
  const existingRemovals = removals.filter((path) => existsSync(join(root, path)));
  if (writes.length || existingRemovals.length || !isDeepStrictEqual(previous, manifest)) {
    manifest.renderedAt = new Date().toISOString();
    writes.push({ path: MANIFEST_FILENAME, content: `${JSON.stringify(manifest, null, 2)}\n` });
  }
  const warnings = [...rendered.output.warnings, ...config.warnings, ...mcp.warnings];
  if (preserved.length) warnings.push(`preserved user-owned artifacts: ${preserved.join(", ")}`);
  return { writes, removals: existingRemovals, owned, manifest, warnings };
}

/** All reads and validation precede backup creation and project mutations. */
export function planUpdate(args: UpdateArgs): UpdatePlan {
  const root = resolve(args.targetDir);
  const { manifest: previous, sourceVersion, engines, hookEngines } = readUpdateInstallation(root);
  const plan = planInstallation(args, { previous, sourceVersion, engines, hookEngines });
  const warnings = [...plan.warnings];
  if (!previous.fileHashes) {
    warnings.push(
      "legacy manifest has no file fingerprints: managed artifacts will be regenerated; backup preserves their previous contents",
    );
  }
  if (engines.includes("codex-cli"))
    warnings.push("ensure .agents/ is ignored by Git (run harness check)");
  return {
    writes: plan.writes,
    removals: plan.removals,
    owned: plan.owned,
    result: {
      version: VERSION,
      fromManifestVersion: sourceVersion,
      dryRun: args.dryRun === true,
      upToDate: plan.writes.length === 0 && plan.removals.length === 0,
      filesToWrite: plan.writes.map((file) => file.path),
      filesToRemove: plan.removals,
      warnings,
    },
  };
}

export function updateCommand(args: UpdateArgs): UpdateResult {
  const plan = planUpdate(args);
  if (args.dryRun || plan.result.upToDate) return plan.result;
  const { backupDir } = applyUpdateTransaction(
    resolve(args.targetDir),
    plan.writes,
    plan.removals,
    args.backupDir,
  );
  return { ...plan.result, backupDir };
}
