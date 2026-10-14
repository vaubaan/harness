import type { LintIssue, Linter } from "./types.js";
import { listMarkdown, parseFrontmatter, readText } from "./util.js";

const ADR_DIR = "docs/decisions";

export const adrNoTracks: Linter = {
  id: "lint:adr-no-tracks",
  pillars: ["decisions"],
  defaultSeverity: "error",
  suggestedSkills: ["/decision"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    const files = listMarkdown(repoRoot, ADR_DIR);
    for (const f of files) {
      const text = readText(repoRoot, f);
      const { data } = parseFrontmatter(text);
      if (!("tracks" in data)) continue;
      const value = data.tracks;
      if (Array.isArray(value) && value.length === 0) continue;
      issues.push({
        linter: this.id,
        severity: "error",
        file: f,
        message:
          "ADRs must not declare `tracks:` (or must set it to []). ADRs document a decision frozen in time, not the current state of code — use status: superseded to mark them obsolete instead.",
      });
    }
    return issues;
  },
};
