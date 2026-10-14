import type { LintIssue, Linter } from "./types.js";
import { fileExists } from "./util.js";

const REQUIRED_FILES = [
  "docs/tests/integration-tests.md",
  "docs/tests/e2e-tests.md",
  "docs/workflow/coding-workflow.md",
];

export const cardinalFiles: Linter = {
  id: "lint:cardinal-files",
  pillars: ["tests", "workflow"],
  defaultSeverity: "error",
  suggestedSkills: ["/test-plan", "/workflow"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const f of REQUIRED_FILES) {
      if (!fileExists(repoRoot, f)) {
        issues.push({
          linter: this.id,
          severity: "error",
          file: f,
          message: `missing required cardinal file: ${f}`,
        });
      }
    }
    return issues;
  },
};
