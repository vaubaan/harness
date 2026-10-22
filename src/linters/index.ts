import { adrNoTracks } from "./adr-no-tracks.js";
import { cardinalFiles } from "./cardinal-files.js";
import { loadLintConfig } from "./config.js";
import { crossLinks } from "./cross-links.js";
import { decisionSchema } from "./decision-schema.js";
import { docLayout } from "./doc-layout.js";
import { frontmatterTracks } from "./frontmatter-tracks.js";
import { generatedFresh } from "./generated-fresh.js";
import { gitignoreHarness } from "./gitignore-harness.js";
import { orphanDecisions } from "./orphan-decisions.js";
import { qualitySchema } from "./quality-schema.js";
import { readmePresence } from "./readme-presence.js";
import { readmeSections } from "./readme-sections.js";
import { specHasContent } from "./spec-has-content.js";
import { specTechAgnostic } from "./spec-tech-agnostic.js";
import { tracksDrift } from "./tracks-drift.js";
import type { LintContext, LintIssue, LintReport, Linter } from "./types.js";

export const ALL_LINTERS: ReadonlyArray<Linter> = [
  readmePresence,
  readmeSections,
  docLayout,
  cardinalFiles,
  decisionSchema,
  adrNoTracks,
  frontmatterTracks,
  tracksDrift,
  specTechAgnostic,
  specHasContent,
  crossLinks,
  orphanDecisions,
  gitignoreHarness,
  qualitySchema,
  generatedFresh,
];

export interface RunOptions {
  pillar?: string;
  only?: ReadonlyArray<string>;
}

export function runLinters(repoRoot: string, opts: RunOptions = {}): LintReport {
  const config = loadLintConfig(repoRoot);
  const ctx: LintContext = { repoRoot, config };
  const filtered = ALL_LINTERS.filter((l) => {
    if (opts.only && !opts.only.includes(l.id)) return false;
    if (opts.pillar && !l.pillars.includes(opts.pillar) && !l.pillars.includes("all")) return false;
    return true;
  });
  const issues: LintIssue[] = [];
  for (const linter of filtered) {
    try {
      issues.push(...linter.run(repoRoot, ctx));
    } catch (err) {
      issues.push({
        linter: linter.id,
        severity: "error",
        file: "<internal>",
        message: `linter crashed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  return {
    version: 1,
    summary: { errors, warnings, pass: errors === 0 },
    issues,
  };
}

function suggestedSkillsFor(linterId: string): ReadonlyArray<string> {
  const linter = ALL_LINTERS.find((l) => l.id === linterId);
  return linter?.suggestedSkills ?? [];
}

export function formatReportText(report: LintReport): string {
  const lines: string[] = [];
  for (const issue of report.issues) {
    const location = issue.line !== undefined ? `:${issue.line}` : "";
    lines.push(`${issue.file}${location}: ${issue.severity}[${issue.linter}]\n  ${issue.message}`);
    const hints = suggestedSkillsFor(issue.linter);
    if (hints.length > 0) {
      lines.push(`  → Try: ${hints.join(", ")}`);
    }
  }
  const { errors, warnings, pass } = report.summary;
  lines.push("");
  lines.push(
    `${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}. ${pass ? "✔ CI passes." : "✘ CI fails."}`,
  );
  return lines.join("\n");
}

export type { HarnessLintConfig } from "./config.js";
export { loadLintConfig } from "./config.js";
export type { LintContext, Linter, LintIssue, LintReport, Severity } from "./types.js";
