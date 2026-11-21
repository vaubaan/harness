import type { LintIssue, Linter } from "./types.js";
import { listMarkdown } from "./util.js";

/** The spec is core, but a project that just started is warned, not failed. */
export const specHasContent: Linter = {
  id: "lint:spec-has-content",
  pillars: ["spec"],
  defaultSeverity: "warning",
  suggestedSkills: ["/harn-spec"],
  run(repoRoot: string): LintIssue[] {
    const files = listMarkdown(repoRoot, "docs/spec");
    if (files.length > 0) return [];
    return [
      {
        linter: this.id,
        severity: "warning",
        file: "docs/spec",
        message: "no spec yet: docs/spec/ has no markdown file — write the first spec document",
      },
    ];
  },
};
