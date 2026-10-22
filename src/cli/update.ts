import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DisableYamlSchema } from "../loader.js";
import type { Engine, RenderedFile } from "../types.js";
import { parseYAML } from "../util/yaml.js";
import { VERSION } from "../version.js";
import { RELEASED_PATHS, assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, MANIFEST_VERSION, type Manifest, hashContent } from "./manifest.js";
import { planInit } from "./plan-render.js";
import { readUpdateInstallation } from "./update-manifest.js";
import { applyUpdateTransaction } from "./update-transaction.js";

/** Engine settings files 1.x wrote a Stop hook into, and the command it called. */
const LEGACY_HOOK_FILES = [".claude/settings.json", ".codex/hooks.json"] as const;
const LEGACY_HOOK_MARKER = "@vaubaan/harness stop-hook";

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
}

function currentContent(root: string, path: string): string | undefined {
  return existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined;
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

/** Files 1.x edited or wrote into engine settings leave the manifest and stay in place. */
function releaseLegacyPaths(previous: Manifest, warnings: string[]): Manifest {
  const released = previous.files.filter((path) => RELEASED_PATHS.includes(path));
  for (const path of released) {
    warnings.push(`no longer managed by the harness, left in place: ${path}`);
  }
  if (released.length === 0) return previous;
  return { ...previous, files: previous.files.filter((path) => !released.includes(path)) };
}

/** A Stop hook entry 1.x merged into an engine settings file now points at a no-op. */
function legacyHookWarnings(root: string): string[] {
  const warnings: string[] = [];
  for (const path of LEGACY_HOOK_FILES) {
    const content = currentContent(root, path);
    if (content?.includes(LEGACY_HOOK_MARKER)) {
      warnings.push(
        `remove the harness Stop hook entry from ${path}: the Stop hook was removed in 2.0, run \`npx @vaubaan/harness lint\` in CI and pre-commit instead`,
      );
    }
  }
  return warnings;
}

/** All reads and validation precede backup creation and project mutations. */
export function planInstallation(
  args: Omit<UpdateArgs, "dryRun" | "backupDir">,
  settings: InstallationSettings,
): Omit<UpdatePlan, "result"> & { manifest: Manifest; warnings: string[] } {
  const root = resolve(args.targetDir);
  const { engines } = settings;
  const warnings: string[] = [];
  const previous = releaseLegacyPaths(settings.previous, warnings);
  const preserved = [
    ...new Set([...(previous.preservedFiles ?? []), ...(args.preserveFiles ?? [])]),
  ].sort();
  if (preserved.includes(MANIFEST_FILENAME))
    throw new Error("cannot preserve the harness manifest");
  assertManagedPaths(root, [...previous.files, ...preserved]);
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
  });
  const output = rendered.output.files.filter((file) => !preserved.includes(file.path));
  const owned = output.map((file) => file.path).sort();
  const removals = previous.files.filter(
    (file) => !owned.includes(file) && !preserved.includes(file),
  );
  assertManagedPaths(root, [...owned, ...removals]);
  checkArtifactConflicts(root, previous, output, removals);
  const hashes = Object.fromEntries(output.map((file) => [file.path, hashContent(file.content)]));
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    harnessVersion: VERSION,
    engines: [...engines].sort(),
    renderedAt: previous.renderedAt,
    files: owned,
    fileHashes: hashes,
    ...(hasOverrides ? { overridesDir: overridesDir === root ? "." : overridesDir } : {}),
    ...(preserved.length ? { preservedFiles: preserved } : {}),
  };
  const writes = output.filter((file) => currentContent(root, file.path) !== file.content);
  const existingRemovals = removals.filter((path) => existsSync(join(root, path)));
  if (writes.length || existingRemovals.length || !isDeepStrictEqual(settings.previous, manifest)) {
    manifest.renderedAt = new Date().toISOString();
    writes.push({ path: MANIFEST_FILENAME, content: `${JSON.stringify(manifest, null, 2)}\n` });
  }
  warnings.push(...rendered.output.warnings, ...legacyHookWarnings(root));
  if (preserved.length) warnings.push(`preserved user-owned artifacts: ${preserved.join(", ")}`);
  return { writes, removals: existingRemovals, owned, manifest, warnings };
}

/** All reads and validation precede backup creation and project mutations. */
export function planUpdate(args: UpdateArgs): UpdatePlan {
  const root = resolve(args.targetDir);
  const { manifest: previous, sourceVersion, engines } = readUpdateInstallation(root);
  const plan = planInstallation(args, { previous, sourceVersion, engines });
  const warnings = [...plan.warnings];
  if (!previous.fileHashes) {
    warnings.push(
      "legacy manifest has no file fingerprints: managed artifacts will be regenerated; backup preserves their previous contents",
    );
  }
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
