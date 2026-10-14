import { basename } from "node:path";
import fg from "fast-glob";
import type { LintContext, LintIssue, Linter } from "./types.js";
import { listMarkdown, readText } from "./util.js";

export const orphanDecisions: Linter = {
  id: "lint:orphan-decisions",
  pillars: ["decisions"],
  defaultSeverity: "warning",
  suggestedSkills: ["/handbook"],
  run(repoRoot: string, ctx?: LintContext): LintIssue[] {
    const extra = ctx?.config.ignore ?? [];
    const issues: LintIssue[] = [];
    const adrs = listMarkdown(repoRoot, "docs/decisions");
    if (adrs.length === 0) return issues;

    const otherDocs = fg.sync("**/*.md", {
      cwd: repoRoot,
      absolute: false,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        ".harness-overrides/**",
        "docs/decisions/**",
        "skills/**",
        "agents/**",
        "commands/**",
        "templates/**",
        ...extra,
      ],
    });

    const referenceCorpus = otherDocs.map((f) => readText(repoRoot, f)).join("\n");

    for (const adr of adrs) {
      const filename = basename(adr);
      const stem = filename.replace(/\.md$/, "");
      const referenced = referenceCorpus.includes(filename) || referenceCorpus.includes(stem);
      if (!referenced) {
        issues.push({
          linter: this.id,
          severity: "warning",
          file: adr,
          message: "ADR is not referenced by any other doc file (orphan)",
        });
      }
    }
    return issues;
  },
};
