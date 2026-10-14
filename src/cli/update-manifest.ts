import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ENGINES, type Engine } from "../types.js";
import { assertManagedPaths } from "./managed-paths.js";
import { MANIFEST_FILENAME, type Manifest, readManifest } from "./manifest.js";

const EngineSchema = z.enum(ENGINES);
const LegacySchema = z.object({
  version: z.enum(["1", "2", "3"]),
  engine: EngineSchema.optional(),
  engines: z.array(EngineSchema).nonempty().optional(),
  renderedAt: z.string(),
  files: z.array(z.string()),
});

export interface UpdateInstallation {
  manifest: Manifest;
  sourceVersion: string;
  engines: Engine[];
  hookEngines: Engine[];
}

const HOOK_PATHS: Record<Engine, string[]> = {
  "claude-code": [".claude/settings.json"],
  "codex-cli": [".codex/hooks.json"],
  opencode: [
    ".opencode/plugins/harness-stop-hook/index.ts",
    ".opencode/plugins/harness-stop-hook.ts",
  ],
};

/** Historical schemas are accepted only by the explicit migration command. */
export function readUpdateInstallation(root: string): UpdateInstallation {
  assertManagedPaths(root, [MANIFEST_FILENAME]);
  if (!existsSync(join(root, MANIFEST_FILENAME))) {
    throw new Error("no harness manifest found; use init for a new installation");
  }
  const raw = JSON.parse(readFileSync(join(root, MANIFEST_FILENAME), "utf8"));
  const sourceVersion = String(raw?.version);
  let manifest: Manifest;
  if (["1", "2", "3"].includes(sourceVersion)) {
    const legacy = LegacySchema.parse(raw);
    const engines = legacy.version === "1" ? [EngineSchema.parse(legacy.engine)] : legacy.engines;
    manifest = {
      version: "4",
      engines: z.array(EngineSchema).nonempty().parse(engines),
      files: legacy.files,
      renderedAt: legacy.renderedAt,
    };
  } else {
    const current = readManifest(root);
    if (!current) throw new Error("harness manifest disappeared during planning");
    manifest = current;
  }
  const engines = [...new Set(z.array(EngineSchema).nonempty().parse(manifest.engines))];
  const hookEngines =
    manifest.stopHookInstalled === false
      ? []
      : manifest.stopHookEngines !== undefined
        ? z.array(EngineSchema).parse(manifest.stopHookEngines)
        : manifest.stopHookInstalled === true
          ? engines
          : engines.filter((engine) =>
              HOOK_PATHS[engine].some((path) => manifest.files.includes(path)),
            );
  if (hookEngines.some((engine) => !engines.includes(engine))) {
    throw new Error("manifest stopHookEngines must be a subset of installed engines");
  }
  return { manifest, sourceVersion, engines, hookEngines: [...new Set(hookEngines)] };
}
