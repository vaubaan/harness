import type { LintIssue, Linter } from "./types.js";
import { fileExists, readText } from "./util.js";

const REQUIRED_SECTIONS = [
  /^#\s+\S/m,
  /^##?\s+(What is this|Quick start)/im,
  /^##?\s+(Quick start|Install|Getting started)/im,
];

const REQUIRED_LABELS = ["title (# H1)", "What is this / intro", "Quick start / Install"];

export const readmeSections: Linter = {
  id: "lint:readme-sections",
  pillars: ["readme"],
  defaultSeverity: "error",
  suggestedSkills: ["/readme"],
  run(repoRoot: string): LintIssue[] {
    if (!fileExists(repoRoot, "README.md")) return [];
    const text = readText(repoRoot, "README.md");
    const issues: LintIssue[] = [];
    for (let i = 0; i < REQUIRED_SECTIONS.length; i++) {
      const pattern = REQUIRED_SECTIONS[i];
      const label = REQUIRED_LABELS[i];
      if (pattern && !pattern.test(text)) {
        issues.push({
          linter: this.id,
          severity: "error",
          file: "README.md",
          message: `missing required section: ${label}`,
        });
      }
    }
    return issues;
  },
};
