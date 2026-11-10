import { readIntentFiles } from "../parser/intent.js";
import type { LintIssue, Linter } from "./types.js";
import { trackedPathExists } from "./util.js";

/**
 * Every anchor of an intent matches at least one file, with the
 * resolution of `tracks:`. A `deprecated` node is skipped: its anchors may
 * already be gone (docs/spec/coding-agent-harness.md §9.1.3).
 */
export const intentAnchors: Linter = {
  id: "lint:intent-anchors",
  pillars: ["intents"],
  defaultSeverity: "error",
  suggestedSkills: ["/intent"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const intentFile of readIntentFiles(repoRoot)) {
      for (const node of intentFile.nodes) {
        if (node.effectiveStatus === "deprecated") continue;
        for (const anchor of node.anchors) {
          if (trackedPathExists(repoRoot, anchor)) continue;
          issues.push({
            linter: this.id,
            severity: "error",
            file: intentFile.path,
            line: node.line,
            message: `"${node.title}": anchor matches no file: ${anchor}`,
          });
        }
      }
    }
    return issues;
  },
};
