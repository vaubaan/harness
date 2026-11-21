import { vocabularyOf } from "../parser/docs.js";
import { readIntentFiles } from "../parser/intent.js";
import { intentFileSpecs, resolveSpecPath } from "./intent-util.js";
import type { LintIssue, Linter } from "./types.js";
import { fileExists, readText } from "./util.js";

/** Shared with the context graph; re-exported for the linters' callers. */
export { entitySlug, vocabularyOf } from "../parser/docs.js";

/**
 * Every entity a terminal intent requires or creates is a term of the
 * Vocabulary section of one of the file's specs. Downgraded to one
 * warning per intent file when none of its specs has a Vocabulary section.
 */
export const intentVocabulary: Linter = {
  id: "lint:intent-vocabulary",
  pillars: ["intents"],
  defaultSeverity: "error",
  suggestedSkills: ["/harn-spec"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const intentFile of readIntentFiles(repoRoot)) {
      const used = intentFile.nodes.flatMap((node) =>
        [...node.requires, ...node.creates].map((entity) => ({ entity, node })),
      );
      if (used.length === 0) continue;
      // A spec that does not resolve is lint:intent-schema's report.
      const specs = intentFileSpecs(intentFile.meta)
        .map((spec) => resolveSpecPath(intentFile.path, spec))
        .filter((path) => fileExists(repoRoot, path));
      if (specs.length === 0) continue;
      const entities = new Set<string>();
      let hasVocabulary = false;
      for (const spec of specs) {
        const terms = vocabularyOf(readText(repoRoot, spec));
        if (!terms) continue;
        hasVocabulary = true;
        for (const term of terms) entities.add(term);
      }
      if (!hasVocabulary) {
        issues.push({
          linter: this.id,
          severity: "warning",
          file: intentFile.path,
          message: `no Vocabulary section in ${specs.join(", ")}; entities not checked`,
        });
        continue;
      }
      for (const { entity, node } of used) {
        if (entities.has(entity)) continue;
        issues.push({
          linter: this.id,
          severity: "error",
          file: intentFile.path,
          line: node.line,
          message: `"${node.title}": entity \`${entity}\` is not a Vocabulary term of ${specs.join(", ")}`,
        });
      }
    }
    return issues;
  },
};
