import type { HarnessLintConfig } from "./config.js";

export type Severity = "error" | "warning";

export interface LintIssue {
  linter: string;
  severity: Severity;
  file: string;
  line?: number;
  message: string;
}

export interface LintContext {
  repoRoot: string;
  config: HarnessLintConfig;
}

export interface Linter {
  id: string;
  pillars: ReadonlyArray<string>;
  defaultSeverity: Severity;
  suggestedSkills?: ReadonlyArray<string>;
  run(repoRoot: string, ctx?: LintContext): LintIssue[];
}

export interface LintReport {
  version: 1;
  summary: { errors: number; warnings: number; pass: boolean };
  issues: LintIssue[];
}
