import { maskFencedCode, parseHeading, readIntentFiles } from "../parser/intent.js";
import { intentFileSpecs, resolveSpecPath } from "./intent-util.js";
import type { LintIssue, Linter } from "./types.js";
import { fileExists, readText } from "./util.js";

const VOCABULARY_HEADING = /^#+\s*(\d+(\.\d+)*\.?\s*)?(Vocabulary|Vocabulaire)\b/i;
const TERM = /^\s*[-*]\s+\*\*([^*]+)\*\*/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}/;

/** The term of a Vocabulary table row: its first cell, without emphasis; `undefined` for a placeholder. */
function tableTerm(line: string, next: string | undefined): string | undefined {
  const row = TABLE_ROW.exec(line)?.[1];
  if (row === undefined || TABLE_SEPARATOR.test(line)) return undefined;
  // The header row is the one right above the separator.
  if (next !== undefined && TABLE_SEPARATOR.test(next)) return undefined;
  const cell = (row.split("|")[0] ?? "").replace(/[*_`]/g, "").trim();
  if (!cell || /^<.*>$/.test(cell)) return undefined;
  return cell;
}

/** `**Generated file**` gives `generated-file`. */
export function entitySlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The entities of a spec: the slugs of the bold terms opening a bullet of
 * its Vocabulary section, and of the first cell of each row of a table in
 * that section (the spec template's form), up to the next heading of the
 * same or a higher level. `undefined` when the spec has no Vocabulary
 * section.
 */
export function vocabularyOf(specText: string): Set<string> | undefined {
  const lines = maskFencedCode(specText.split(/\r?\n/));
  let depth: number | undefined;
  let terms: Set<string> | undefined;
  for (const [i, line] of lines.entries()) {
    const heading = parseHeading(line);
    if (depth !== undefined) {
      if (heading && heading.depth <= depth) break;
      const term = TERM.exec(line)?.[1] ?? tableTerm(line, lines[i + 1]);
      if (term) terms?.add(entitySlug(term));
      continue;
    }
    if (heading && VOCABULARY_HEADING.test(line)) {
      depth = heading.depth;
      terms = new Set();
    }
  }
  return terms;
}

/**
 * Every entity a terminal intent requires or creates is a term of the
 * Vocabulary section of one of the file's specs. Downgraded to one
 * warning per intent file when none of its specs has a Vocabulary section.
 */
export const intentVocabulary: Linter = {
  id: "lint:intent-vocabulary",
  pillars: ["intents"],
  defaultSeverity: "error",
  suggestedSkills: ["/spec"],
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
