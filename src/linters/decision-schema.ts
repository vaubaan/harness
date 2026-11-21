import { ADR_SECTIONS } from "../parser/docs.js";
import type { LintIssue, Linter } from "./types.js";
import { listMarkdown, readText } from "./util.js";

export const decisionSchema: Linter = {
  id: "lint:decision-schema",
  pillars: ["decisions"],
  defaultSeverity: "error",
  suggestedSkills: ["/harn-decision"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    const files = listMarkdown(repoRoot, "docs/decisions");
    for (const f of files) {
      const text = readText(repoRoot, f);
      for (const { label, pattern } of ADR_SECTIONS) {
        if (!pattern.test(text)) {
          issues.push({
            linter: this.id,
            severity: "error",
            file: f,
            message: `missing required section: "${label}"`,
          });
        }
      }
    }
    return issues;
  },
};
