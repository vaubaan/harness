import { readIntentFiles } from "../parser/intent.js";
import type { LintIssue, Linter } from "./types.js";

/**
 * Across all intent files, an entity a terminal intent requires that no terminal
 * intent creates: the intent is unreachable in the doc
 * (docs/spec/coding-agent-harness.md §9.1.3).
 */
export const intentGraph: Linter = {
  id: "lint:intent-graph",
  pillars: ["intents"],
  defaultSeverity: "warning",
  suggestedSkills: ["/intent"],
  run(repoRoot: string): LintIssue[] {
    const intentFiles = readIntentFiles(repoRoot);
    const terminals = intentFiles.flatMap((intentFile) =>
      intentFile.nodes.filter((node) => node.isTerminal).map((node) => ({ intentFile, node })),
    );
    const created = new Set(terminals.flatMap(({ node }) => node.creates));
    const issues: LintIssue[] = [];
    for (const { intentFile, node } of terminals) {
      for (const entity of node.requires) {
        if (created.has(entity)) continue;
        issues.push({
          linter: this.id,
          severity: "warning",
          file: intentFile.path,
          line: node.line,
          message: `"${node.title}": entity \`${entity}\` is required here but no terminal intent creates it`,
        });
      }
    }
    return issues;
  },
};
