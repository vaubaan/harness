import type { LintIssue, Linter } from "./types.js";
import { fileExists, readText } from "./util.js";

/** Paths the harness generates or writes at runtime; none belongs in Git. */
export const REQUIRED_GITIGNORE_ENTRIES: ReadonlyArray<string> = [
  ".harness-overrides/",
  ".harness-manifest.json",
  ".harness/",
  ".claude/",
  ".codex/",
  ".opencode/",
  ".agents/",
  ".vaubaan/",
  "AGENTS.md",
  "CLAUDE.md",
  ".mcp.json",
];

export const gitignoreHarness: Linter = {
  id: "lint:gitignore-harness",
  pillars: ["repo-root"],
  defaultSeverity: "error",
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    if (!fileExists(repoRoot, ".gitignore")) {
      issues.push({
        linter: this.id,
        severity: "error",
        file: ".gitignore",
        message: ".gitignore is missing at repo root",
      });
      return issues;
    }
    const text = readText(repoRoot, ".gitignore");
    const lines = new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    );
    for (const entry of REQUIRED_GITIGNORE_ENTRIES) {
      const variants = [entry, entry.replace(/\/$/, "")];
      if (!variants.some((v) => lines.has(v))) {
        issues.push({
          linter: this.id,
          severity: "error",
          file: ".gitignore",
          message: `.gitignore must contain "${entry}"`,
        });
      }
    }
    return issues;
  },
};
