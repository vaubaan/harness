import type { LintIssue, Linter } from "./types.js";
import { dirExists, fileExists } from "./util.js";

/** The files a pillar requires once it is active; nothing while its folder is absent. */
const REQUIRED_FILES: ReadonlyArray<{ dir: string; files: ReadonlyArray<string> }> = [
  { dir: "docs/tests", files: ["docs/tests/integration-tests.md", "docs/tests/e2e-tests.md"] },
  { dir: "docs/workflow", files: ["docs/workflow/coding-workflow.md"] },
];

export const cardinalFiles: Linter = {
  id: "lint:cardinal-files",
  pillars: ["tests", "workflow"],
  defaultSeverity: "error",
  suggestedSkills: ["/test-plan", "/workflow"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const { dir, files } of REQUIRED_FILES) {
      if (!dirExists(repoRoot, dir)) continue;
      for (const f of files) {
        if (!fileExists(repoRoot, f)) {
          issues.push({
            linter: this.id,
            severity: "error",
            file: f,
            message: `missing required cardinal file: ${f}`,
          });
        }
      }
    }
    return issues;
  },
};
