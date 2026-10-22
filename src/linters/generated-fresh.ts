import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RELEASED_PATHS } from "../cli/managed-paths.js";
import { readManifest } from "../cli/manifest.js";
import { planInit } from "../cli/plan-render.js";
import type { LintIssue, Linter } from "./types.js";

const FIX = "run `npx @vaubaan/harness update .` and commit the result";

/**
 * Generated files are committed; this linter is what keeps them honest. It
 * renders the harness with the engines and overrides the manifest records
 * and compares every file with the working tree
 * (docs/decisions/generated-files-committed.md).
 */
export const generatedFresh: Linter = {
  id: "lint:generated-fresh",
  pillars: ["repo-root"],
  defaultSeverity: "error",
  run(repoRoot: string): LintIssue[] {
    const issue = (file: string, message: string): LintIssue => ({
      linter: this.id,
      severity: "error",
      file,
      message,
    });
    let manifest: ReturnType<typeof readManifest>;
    try {
      manifest = readManifest(repoRoot);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return [issue(".harness-manifest.json", `invalid harness manifest: ${reason}`)];
    }
    if (!manifest) return [];
    const overridesParent = manifest.overridesDir
      ? resolve(repoRoot, manifest.overridesDir)
      : repoRoot;
    const hasOverrides = existsSync(join(overridesParent, ".harness-overrides"));
    let rendered: ReturnType<typeof planInit>;
    try {
      rendered = planInit({
        targetDir: repoRoot,
        engines: manifest.engines,
        overridesDir: hasOverrides ? overridesParent : undefined,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return [issue(".harness-manifest.json", `cannot render the harness: ${reason}`)];
    }
    const preserved = new Set(manifest.preservedFiles ?? []);
    const issues: LintIssue[] = [];
    const renderedPaths = new Set<string>();
    for (const file of rendered.output.files) {
      if (preserved.has(file.path)) continue;
      renderedPaths.add(file.path);
      const full = join(repoRoot, file.path);
      if (!existsSync(full)) {
        issues.push(issue(file.path, `generated file is missing; ${FIX}`));
      } else if (readFileSync(full, "utf8") !== file.content) {
        issues.push(
          issue(
            file.path,
            `generated file differs from the current render; edit its source in docs/ or .harness-overrides/, then ${FIX}`,
          ),
        );
      }
    }
    for (const path of manifest.files) {
      if (renderedPaths.has(path) || preserved.has(path) || RELEASED_PATHS.includes(path)) continue;
      if (existsSync(join(repoRoot, path))) {
        issues.push(issue(path, `stale generated file, no longer rendered; ${FIX}`));
      }
    }
    return issues;
  },
};
