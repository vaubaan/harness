import type { LintIssue, Linter } from "./types.js";
import { fileExists, readText } from "./util.js";

const REQUIRED_ENTRIES = [
  ".harness-overrides/",
  ".harness-manifest.json",
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
    for (const entry of REQUIRED_ENTRIES) {
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
