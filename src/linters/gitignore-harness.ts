import type { LintIssue, Linter } from "./types.js";
import { fileExists, readText } from "./util.js";

/** Local, disposable state: never in Git. */
export const REQUIRED_GITIGNORE_ENTRIES: ReadonlyArray<string> = [
  ".harness-overrides/",
  ".vaubaan/",
];

/**
 * Generated files are committed, so a clone has the whole context without
 * the harness installed (docs/decisions/generated-files-committed.md).
 */
export const FORBIDDEN_GITIGNORE_ENTRIES: ReadonlyArray<string> = [
  "AGENTS.md",
  "CLAUDE.md",
  ".claude/",
  ".codex/",
  ".agents/",
  ".opencode/",
  ".harness-manifest.json",
];

/** Non-empty, non-comment lines, with a leading `/` and a trailing `/` normalized away. */
export function gitignoreEntries(text: string): Set<string> {
  const entries = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    entries.add(line.replace(/^\//, "").replace(/\/$/, ""));
  }
  return entries;
}

function normalize(entry: string): string {
  return entry.replace(/\/$/, "");
}

export function missingGitignoreEntries(text: string): string[] {
  const lines = gitignoreEntries(text);
  return REQUIRED_GITIGNORE_ENTRIES.filter((entry) => !lines.has(normalize(entry)));
}

export function forbiddenGitignoreEntries(text: string): string[] {
  const lines = gitignoreEntries(text);
  return FORBIDDEN_GITIGNORE_ENTRIES.filter((entry) => lines.has(normalize(entry)));
}

export const gitignoreHarness: Linter = {
  id: "lint:gitignore-harness",
  pillars: ["repo-root"],
  defaultSeverity: "error",
  run(repoRoot: string): LintIssue[] {
    if (!fileExists(repoRoot, ".gitignore")) {
      return [
        {
          linter: this.id,
          severity: "error",
          file: ".gitignore",
          message: ".gitignore is missing at repo root",
        },
      ];
    }
    const text = readText(repoRoot, ".gitignore");
    const issues: LintIssue[] = [];
    for (const entry of missingGitignoreEntries(text)) {
      issues.push({
        linter: this.id,
        severity: "error",
        file: ".gitignore",
        message: `.gitignore must contain "${entry}"`,
      });
    }
    for (const entry of forbiddenGitignoreEntries(text)) {
      issues.push({
        linter: this.id,
        severity: "error",
        file: ".gitignore",
        message: `.gitignore must not contain "${entry}": files the harness generates are committed`,
      });
    }
    return issues;
  },
};
