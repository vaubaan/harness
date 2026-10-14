import type { LintIssue, Linter } from "./types.js";
import { dirExists } from "./util.js";

const REQUIRED_DIRS = [
  "docs/spec",
  "docs/decisions",
  "docs/handbook",
  "docs/tests",
  "docs/workflow",
];

export const docLayout: Linter = {
  id: "lint:doc-layout",
  pillars: ["all"],
  defaultSeverity: "error",
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const dir of REQUIRED_DIRS) {
      if (!dirExists(repoRoot, dir)) {
        issues.push({
          linter: this.id,
          severity: "error",
          file: dir,
          message: `missing required directory: ${dir}/`,
        });
      }
    }
    return issues;
  },
};
