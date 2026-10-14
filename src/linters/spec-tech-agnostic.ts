import type { LintIssue, Linter } from "./types.js";
import { findLineNumber, listMarkdown, readText } from "./util.js";

function maskFencedBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "));
}

const TECH_BLOCKLIST: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /\bNext\.?js\b/i, keyword: "Next.js" },
  { pattern: /\bSupabase\b/i, keyword: "Supabase" },
  { pattern: /\bVercel\b/i, keyword: "Vercel" },
  { pattern: /\bReact\b/, keyword: "React" },
  { pattern: /\bTypeScript\b/, keyword: "TypeScript" },
  { pattern: /\bDocker\b/, keyword: "Docker" },
  { pattern: /\bKubernetes\b/i, keyword: "Kubernetes" },
  { pattern: /\bPostgres(QL)?\b/i, keyword: "Postgres" },
  { pattern: /\bMySQL\b/i, keyword: "MySQL" },
  { pattern: /\bRedis\b/i, keyword: "Redis" },
  { pattern: /\bnpm\b/, keyword: "npm" },
  { pattern: /\bpnpm\b/, keyword: "pnpm" },
  { pattern: /\byarn\b/, keyword: "yarn" },
];

export const specTechAgnostic: Linter = {
  id: "lint:spec-tech-agnostic",
  pillars: ["spec"],
  defaultSeverity: "error",
  suggestedSkills: ["/spec"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    const files = listMarkdown(repoRoot, "docs/spec");
    for (const f of files) {
      const text = maskFencedBlocks(readText(repoRoot, f));
      for (const { pattern, keyword } of TECH_BLOCKLIST) {
        if (pattern.test(text)) {
          const issue: LintIssue = {
            linter: this.id,
            severity: "error",
            file: f,
            message: `forbidden tech keyword "${keyword}" — should be in handbook/ or decisions/`,
          };
          const line = findLineNumber(text, pattern);
          if (line !== undefined) issue.line = line;
          issues.push(issue);
        }
      }
    }
    return issues;
  },
};
