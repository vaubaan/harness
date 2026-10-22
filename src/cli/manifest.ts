import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Engine } from "../types.js";
import { VERSION } from "../version.js";
import { assertManagedPaths } from "./managed-paths.js";

export const MANIFEST_FILENAME = ".harness-manifest.json";
export const MANIFEST_VERSION = "6";

// Fields written by 1.x and dropped on read as unknown keys: the entry
// ownership of shared files (`hookConfigs`, `opencodeConfig`, `mcpConfig`)
// and the Stop hook preference (`stopHookInstalled`, `stopHookEngines`).
// Decisions: no-mcp-no-code-merge, lint-in-ci-and-pre-commit.
const ManifestSchema = z.object({
  version: z.enum(["4", "5", MANIFEST_VERSION]),
  engines: z.array(z.string()),
  renderedAt: z.string(),
  files: z.array(z.string()),
  harnessVersion: z.string().optional(),
  overridesDir: z.string().optional(),
  fileHashes: z.record(z.string().regex(/^[a-f0-9]{64}$/)).optional(),
  preservedFiles: z.array(z.string()).optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;

export interface WriteManifestExtras {
  overridesDir?: string;
  preservedFiles?: string[];
}

export function manifestPath(targetDir: string): string {
  return join(targetDir, MANIFEST_FILENAME);
}

export function writeManifest(
  targetDir: string,
  engines: ReadonlyArray<Engine>,
  files: string[],
  extras: WriteManifestExtras = {},
): void {
  assertManagedPaths(targetDir, [MANIFEST_FILENAME]);
  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    harnessVersion: VERSION,
    engines: [...engines].sort(),
    renderedAt: new Date().toISOString(),
    files: [...files].sort(),
    fileHashes: Object.fromEntries(
      files
        .filter((file) => existsSync(join(targetDir, file)))
        .sort()
        .map((file) => [file, hashContent(readFileSync(join(targetDir, file)))]),
    ),
    ...(extras.overridesDir ? { overridesDir: extras.overridesDir } : {}),
    ...(extras.preservedFiles ? { preservedFiles: extras.preservedFiles } : {}),
  };
  const path = manifestPath(targetDir);
  if (existsSync(path)) chmodSync(path, 0o600);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

export function hashContent(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function readManifest(targetDir: string): Manifest | null {
  assertManagedPaths(targetDir, [MANIFEST_FILENAME]);
  const path = manifestPath(targetDir);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return ManifestSchema.parse(raw);
}
