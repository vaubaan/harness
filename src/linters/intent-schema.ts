import { TERMINAL_FIELDS, readIntentFiles } from "../parser/intent.js";
import { intentFileSpecs, resolveSpecPath } from "./intent-util.js";
import type { LintIssue, Linter } from "./types.js";
import { fileExists } from "./util.js";

/** Facts the code or the tree already says: never declared on a node. */
const DERIVABLE_FIELDS = new Set(["uses", "guards"]);

/**
 * The grammar of the optional intents pillar
 * (docs/spec/coding-agent-harness.md §9.1.3). No effect when
 * `docs/intents/` is absent.
 */
export const intentSchema: Linter = {
  id: "lint:intent-schema",
  pillars: ["intents"],
  defaultSeverity: "error",
  suggestedSkills: ["/intent"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const intentFile of readIntentFiles(repoRoot)) {
      const report = (message: string, line?: number): void => {
        issues.push({
          linter: this.id,
          severity: "error",
          file: intentFile.path,
          ...(line !== undefined ? { line } : {}),
          message,
        });
      };
      for (const error of intentFile.errors) report(error.message, error.line);
      for (const spec of intentFileSpecs(intentFile.meta)) {
        if (!fileExists(repoRoot, resolveSpecPath(intentFile.path, spec))) {
          report(`frontmatter \`spec\` does not resolve: ${spec}`, 1);
        }
      }
      for (const node of intentFile.nodes) {
        const at = (message: string): void => report(`"${node.title}": ${message}`, node.line);
        for (const { key, line } of node.unknownFields) {
          report(
            DERIVABLE_FIELDS.has(key)
              ? `"${node.title}": \`${key}:\` is derivable, never declared`
              : `"${node.title}": unknown field \`${key}:\``,
            line,
          );
        }
        if (
          node.spec !== undefined &&
          !fileExists(repoRoot, resolveSpecPath(intentFile.path, node.spec))
        ) {
          report(`"${node.title}": \`spec:\` does not resolve: ${node.spec}`, node.fieldLines.spec);
        }
        if (!node.isTerminal) {
          for (const field of TERMINAL_FIELDS) {
            const line = node.fieldLines[field];
            if (line !== undefined) {
              report(
                `"${node.title}": \`${field}:\` is a field of a terminal intent, this node has sub-intents`,
                line,
              );
            }
          }
          continue;
        }
        if (Object.keys(node.fieldLines).length === 0) {
          at("a terminal intent carries at least one field");
          continue;
        }
        if (node.effectiveStatus === "implemented" && node.anchors.length === 0) {
          at("an `implemented` intent needs `anchors:`");
        }
        if (node.effectiveStatus === "proposed" && node.acceptance.length === 0) {
          at("a `proposed` intent needs `acceptance:` with at least one `- ` item");
        }
      }
    }
    return issues;
  },
};
