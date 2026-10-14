import fg from "fast-glob";
import type { LintIssue, Linter } from "./types.js";
import {
  gitCommitsSince,
  gitLastCommitForPath,
  listMarkdown,
  parseFrontmatter,
  readText,
} from "./util.js";

const TRACKED_DIRS = ["docs/handbook", "docs/tests", "docs/workflow"];
const DEFAULT_DRIFT_THRESHOLD = 10;

function expandGlob(repoRoot: string, pattern: string): string[] {
  if (pattern.includes("*")) {
    return fg.sync(pattern, { cwd: repoRoot, absolute: false });
  }
  return [pattern];
}

export const tracksDrift: Linter = {
  id: "lint:tracks-drift",
  pillars: ["handbook", "tests", "workflow"],
  defaultSeverity: "warning",
  suggestedSkills: ["/drift", "/handbook"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const dir of TRACKED_DIRS) {
      const files = listMarkdown(repoRoot, dir);
      for (const f of files) {
        const text = readText(repoRoot, f);
        const { data } = parseFrontmatter(text);
        if (!Array.isArray(data.tracks)) continue;
        const docCommit = gitLastCommitForPath(repoRoot, f);
        if (!docCommit) continue;
        const threshold =
          typeof data.driftThreshold === "number" && data.driftThreshold > 0
            ? data.driftThreshold
            : DEFAULT_DRIFT_THRESHOLD;
        let driftCount = 0;
        for (const tracked of data.tracks) {
          if (typeof tracked !== "string") continue;
          const targets = expandGlob(repoRoot, tracked);
          for (const t of targets.length > 0 ? targets : [tracked]) {
            driftCount += gitCommitsSince(repoRoot, t, docCommit.hash);
          }
        }
        if (driftCount > threshold) {
          issues.push({
            linter: this.id,
            severity: "warning",
            file: f,
            message: `tracked files changed in ${driftCount} commits since doc last edit (threshold ${threshold})`,
          });
        }
      }
    }
    return issues;
  },
};
