import { STORY_FIELDS, readJourneys } from "../parser/journey.js";
import { journeySpecs, resolveSpecPath } from "./journey-util.js";
import type { LintIssue, Linter } from "./types.js";
import { fileExists } from "./util.js";

/** Facts the code or the tree already says: never declared on a node. */
const DERIVABLE_FIELDS = new Set(["uses", "guards"]);

/**
 * The grammar of the optional journeys pillar
 * (docs/spec/coding-agent-harness.md §9.1.3). No effect when
 * `docs/journeys/` is absent.
 */
export const journeySchema: Linter = {
  id: "lint:journey-schema",
  pillars: ["journeys"],
  defaultSeverity: "error",
  suggestedSkills: ["/journey"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const journey of readJourneys(repoRoot)) {
      const report = (message: string, line?: number): void => {
        issues.push({
          linter: this.id,
          severity: "error",
          file: journey.path,
          ...(line !== undefined ? { line } : {}),
          message,
        });
      };
      for (const error of journey.errors) report(error.message, error.line);
      for (const spec of journeySpecs(journey.meta)) {
        if (!fileExists(repoRoot, resolveSpecPath(journey.path, spec))) {
          report(`frontmatter \`spec\` does not resolve: ${spec}`, 1);
        }
      }
      for (const node of journey.nodes) {
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
          !fileExists(repoRoot, resolveSpecPath(journey.path, node.spec))
        ) {
          report(`"${node.title}": \`spec:\` does not resolve: ${node.spec}`, node.fieldLines.spec);
        }
        if (!node.isStory) {
          for (const field of STORY_FIELDS) {
            const line = node.fieldLines[field];
            if (line !== undefined) {
              report(
                `"${node.title}": \`${field}:\` is a story field, this node has children`,
                line,
              );
            }
          }
          continue;
        }
        if (Object.keys(node.fieldLines).length === 0) {
          at("a story carries at least one field");
          continue;
        }
        if (node.effectiveStatus === "implemented" && node.anchors.length === 0) {
          at("an `implemented` story needs `anchors:`");
        }
        if (node.effectiveStatus === "proposed" && node.acceptance.length === 0) {
          at("a `proposed` story needs `acceptance:` with at least one `- ` item");
        }
      }
    }
    return issues;
  },
};
