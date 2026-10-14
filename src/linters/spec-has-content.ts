import type { LintIssue, Linter } from "./types.js";
import { dirExists, listMarkdown } from "./util.js";

export const specHasContent: Linter = {
  id: "lint:spec-has-content",
  pillars: ["spec"],
  defaultSeverity: "warning",
  suggestedSkills: ["/spec"],
  run(repoRoot: string): LintIssue[] {
    if (!dirExists(repoRoot, "docs/spec")) return [];
    const files = listMarkdown(repoRoot, "docs/spec");
    if (files.length > 0) return [];
    return [
      {
        linter: this.id,
        severity: "warning",
        file: "docs/spec",
        message: "docs/spec/ has no markdown files — write at least one spec document",
      },
    ];
  },
};
