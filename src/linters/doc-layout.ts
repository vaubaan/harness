import { emptyPillarDirs } from "../pillars.js";
import type { LintIssue, Linter } from "./types.js";

/**
 * No pillar folder is required: a pillar is active when its folder exists
 * (docs/decisions/pillars-on-demand.md). What this linter refuses is a
 * pillar folder holding no file: git does not record it, so the pillar
 * would be active on one machine and inactive on the next.
 */
export const docLayout: Linter = {
  id: "lint:doc-layout",
  pillars: ["all"],
  defaultSeverity: "error",
  run(repoRoot: string): LintIssue[] {
    return emptyPillarDirs(repoRoot).map((dir) => ({
      linter: this.id,
      severity: "error" as const,
      file: dir,
      message: `empty pillar folder: git does not record ${dir}/, so the pillar would be active on this machine only — fill it (\`npx @vaubaan/harness add ${dir.replace("docs/", "")}\`) or remove it`,
    }));
  },
};
