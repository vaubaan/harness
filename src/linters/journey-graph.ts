import { readJourneys } from "../parser/journey.js";
import type { LintIssue, Linter } from "./types.js";

/**
 * Across all journeys, an entity a terminal intent requires that no terminal
 * intent creates: the intent is unreachable in the doc
 * (docs/spec/coding-agent-harness.md §9.1.3).
 */
export const journeyGraph: Linter = {
  id: "lint:journey-graph",
  pillars: ["journeys"],
  defaultSeverity: "warning",
  suggestedSkills: ["/journey"],
  run(repoRoot: string): LintIssue[] {
    const journeys = readJourneys(repoRoot);
    const terminals = journeys.flatMap((journey) =>
      journey.nodes.filter((node) => node.isTerminal).map((node) => ({ journey, node })),
    );
    const created = new Set(terminals.flatMap(({ node }) => node.creates));
    const issues: LintIssue[] = [];
    for (const { journey, node } of terminals) {
      for (const entity of node.requires) {
        if (created.has(entity)) continue;
        issues.push({
          linter: this.id,
          severity: "warning",
          file: journey.path,
          line: node.line,
          message: `"${node.title}": entity \`${entity}\` is required here but no terminal intent creates it`,
        });
      }
    }
    return issues;
  },
};
