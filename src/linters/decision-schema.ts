import type { LintIssue, Linter } from "./types.js";
import { listMarkdown, readText } from "./util.js";

// English headings are canonical; the French ones are still accepted so
// projects written before the switch to English keep passing.
const REQUIRED_SECTIONS: Array<{ label: string; pattern: RegExp }> = [
  { label: "Context", pattern: /^##\s+(Context|Contexte)\b/m },
  { label: "Decision", pattern: /^##\s+(Decision|D[ée]cision)\b/m },
  { label: "Consequences", pattern: /^##\s+(Consequences|Cons[ée]quences)\b/m },
  {
    label: "Rejected alternatives",
    pattern: /^##\s+(Rejected\s+alternatives|Alternatives(\s+rejet[ée]es)?)\b/im,
  },
];

export const decisionSchema: Linter = {
  id: "lint:decision-schema",
  pillars: ["decisions"],
  defaultSeverity: "error",
  suggestedSkills: ["/decision"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    const files = listMarkdown(repoRoot, "docs/decisions");
    for (const f of files) {
      const text = readText(repoRoot, f);
      for (const { label, pattern } of REQUIRED_SECTIONS) {
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
