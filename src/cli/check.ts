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

export function checkCommand(repoRoot: string): CheckResult {
  const issues: string[] = [];

  if (!existsSync(join(repoRoot, "README.md"))) {
    issues.push("README.md missing at repo root");
  }

  // Only the README is required: every pillar under docs/ is added on demand.
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
