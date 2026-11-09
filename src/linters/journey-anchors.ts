import { readJourneys } from "../parser/journey.js";
import type { LintIssue, Linter } from "./types.js";
import { trackedPathExists } from "./util.js";

/**
 * Every anchor of a journey node matches at least one file, with the
 * resolution of `tracks:`. A `deprecated` node is skipped: its anchors may
 * already be gone (docs/spec/coding-agent-harness.md §9.1.3).
 */
export const journeyAnchors: Linter = {
  id: "lint:journey-anchors",
  pillars: ["journeys"],
  defaultSeverity: "error",
  suggestedSkills: ["/journey"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const journey of readJourneys(repoRoot)) {
      for (const node of journey.nodes) {
        if (node.effectiveStatus === "deprecated") continue;
        for (const anchor of node.anchors) {
          if (trackedPathExists(repoRoot, anchor)) continue;
          issues.push({
            linter: this.id,
            severity: "error",
            file: journey.path,
            line: node.line,
            message: `"${node.title}": anchor matches no file: ${anchor}`,
          });
        }
      }
    }
    return issues;
  },
};
