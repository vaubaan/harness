import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  forbiddenGitignoreEntries,
  missingGitignoreEntries,
} from "../linters/gitignore-harness.js";

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
    for (const entry of missingGitignoreEntries(text)) {
      issues.push(`.gitignore missing entry: ${entry}`);
    }
    for (const entry of forbiddenGitignoreEntries(text)) {
      issues.push(`.gitignore must not ignore generated file: ${entry}`);
    }
  }

  return { pass: issues.length === 0, issues };
}
