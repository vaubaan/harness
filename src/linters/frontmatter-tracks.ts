import { existsSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import type { LintIssue, Linter } from "./types.js";
import { listMarkdown, parseFrontmatter, readText } from "./util.js";

const TRACKED_DIRS = ["docs/handbook", "docs/tests", "docs/workflow"];

function trackedPathExists(repoRoot: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    return fg.sync(pattern, { cwd: repoRoot, absolute: false }).length > 0;
  }
  return existsSync(join(repoRoot, pattern));
}

export const frontmatterTracks: Linter = {
  id: "lint:frontmatter-tracks",
  pillars: ["handbook", "tests", "workflow"],
  defaultSeverity: "error",
  suggestedSkills: ["/handbook", "/test-plan", "/workflow"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const dir of TRACKED_DIRS) {
      const files = listMarkdown(repoRoot, dir);
      for (const f of files) {
        const text = readText(repoRoot, f);
        const { data } = parseFrontmatter(text);
        if (!Array.isArray(data.tracks)) {
          issues.push({
            linter: this.id,
            severity: "error",
            file: f,
            message: "missing frontmatter `tracks:` array",
          });
          continue;
        }
        for (const tracked of data.tracks as unknown[]) {
          if (typeof tracked !== "string") {
            issues.push({
              linter: this.id,
              severity: "error",
              file: f,
              message: "`tracks` entries must be strings",
            });
            continue;
          }
          if (!trackedPathExists(repoRoot, tracked)) {
            issues.push({
              linter: this.id,
              severity: "error",
              file: f,
              message: `tracked path does not exist: ${tracked}`,
            });
          }
        }
      }
    }
    return issues;
  },
};
