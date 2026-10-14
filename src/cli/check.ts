import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CheckResult {
  pass: boolean;
  issues: string[];
}

const REQUIRED_DIRS = [
  "docs/spec",
  "docs/decisions",
  "docs/handbook",
  "docs/tests",
  "docs/workflow",
];

const REQUIRED_GITIGNORE_ENTRIES = [
  ".harness-overrides/",
  ".harness-manifest.json",
  ".claude/",
  ".codex/",
  ".opencode/",
  ".agents/",
  ".vaubaan/",
  "AGENTS.md",
  "CLAUDE.md",
];

export function checkCommand(repoRoot: string): CheckResult {
  const issues: string[] = [];

  if (!existsSync(join(repoRoot, "README.md"))) {
    issues.push("README.md missing at repo root");
  }

  for (const d of REQUIRED_DIRS) {
    if (!existsSync(join(repoRoot, d))) {
      issues.push(`missing directory: ${d}/`);
    }
  }

  const gitignorePath = join(repoRoot, ".gitignore");
  if (!existsSync(gitignorePath)) {
    issues.push(".gitignore missing at repo root");
  } else {
    const text = readFileSync(gitignorePath, "utf8");
    const lines = new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    );
    for (const entry of REQUIRED_GITIGNORE_ENTRIES) {
      const variants = [entry, entry.replace(/\/$/, "")];
      if (!variants.some((v) => lines.has(v))) {
        issues.push(`.gitignore missing entry: ${entry}`);
      }
    }
  }

  return { pass: issues.length === 0, issues };
}
