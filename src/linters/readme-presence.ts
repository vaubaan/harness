import type { LintIssue, Linter } from "./types.js";
import { fileExists } from "./util.js";

export const readmePresence: Linter = {
  id: "lint:readme-presence",
  pillars: ["readme"],
  defaultSeverity: "error",
  suggestedSkills: ["/readme"],
  run(repoRoot: string): LintIssue[] {
    if (fileExists(repoRoot, "README.md")) return [];
    return [
      {
        linter: this.id,
        severity: "error",
        file: "README.md",
        message: "README.md is missing at repo root",
      },
    ];
  },
};
