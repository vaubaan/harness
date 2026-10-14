import type { LintIssue, Linter } from "./types.js";
import { dirExists, fileExists, readText } from "./util.js";

const QUALITY_DIR = "docs/quality";
const CARDINAL_FILE = `${QUALITY_DIR}/code-quality.md`;

// English headings are canonical; the French ones are still accepted so
// projects written before the switch to English keep passing.
const REQUIRED_SECTIONS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  {
    label: "Mechanical checks",
    pattern: /^##\s+(Mechanical\s+checks|V[ée]rifications\s+m[ée]caniques)\s*$/im,
  },
  { label: "Project rules", pattern: /^##\s+(Project\s+rules|R[èe]gles\s+du\s+projet)\s*$/im },
  {
    label: "Accepted deviations",
    pattern: /^##\s+(Accepted\s+deviations|[ÉE]carts\s+assum[ée]s)\s*$/im,
  },
];

/**
 * `docs/quality/` is an optional pillar: absent directory = nothing to
 * report. Once the directory exists, its cardinal file and sections are
 * required.
 */
export const qualitySchema: Linter = {
  id: "lint:quality-schema",
  pillars: ["quality"],
  defaultSeverity: "error",
  run(repoRoot: string): LintIssue[] {
    if (!dirExists(repoRoot, QUALITY_DIR)) return [];
    if (!fileExists(repoRoot, CARDINAL_FILE)) {
      return [
        {
          linter: this.id,
          severity: "error",
          file: CARDINAL_FILE,
          message: `missing required cardinal file: ${CARDINAL_FILE}`,
        },
      ];
    }
    const text = readText(repoRoot, CARDINAL_FILE);
    return REQUIRED_SECTIONS.filter(({ pattern }) => !pattern.test(text)).map(({ label }) => ({
      linter: this.id,
      severity: "error" as const,
      file: CARDINAL_FILE,
      message: `missing required section: "${label}"`,
    }));
  },
};
