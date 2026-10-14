import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import fg from "fast-glob";
import type { LintContext, LintIssue, Linter } from "./types.js";
import { readText } from "./util.js";

const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

function maskCodeSpans(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

function isExternalOrAnchor(url: string): boolean {
  if (url.startsWith("http://") || url.startsWith("https://")) return true;
  if (url.startsWith("mailto:")) return true;
  if (url.startsWith("#")) return true;
  return false;
}

function stripFragment(url: string): string {
  const i = url.indexOf("#");
  return i < 0 ? url : url.slice(0, i);
}

function resolveLink(repoRoot: string, sourceFile: string, link: string): string {
  const noFrag = stripFragment(link);
  if (isAbsolute(noFrag)) return join(repoRoot, noFrag);
  return resolve(dirname(join(repoRoot, sourceFile)), noFrag);
}

export const crossLinks: Linter = {
  id: "lint:cross-links",
  pillars: ["all"],
  defaultSeverity: "error",
  run(repoRoot: string, ctx?: LintContext): LintIssue[] {
    const extra = ctx?.config.ignore ?? [];
    const issues: LintIssue[] = [];
    const allDocs = fg.sync("**/*.md", {
      cwd: repoRoot,
      absolute: false,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        ".harness-overrides/**",
        "skills/**",
        "agents/**",
        "commands/**",
        "templates/**",
        "**/*.skill.md",
        "**/*.cmd.md",
        "**/*.agent.md",
        ...extra,
      ],
    });
    for (const f of allDocs) {
      const text = maskCodeSpans(readText(repoRoot, f));
      const lines = text.split("\n");
      for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo] ?? "";
        LINK_REGEX.lastIndex = 0;
        let match: RegExpExecArray | null;
        match = LINK_REGEX.exec(line);
        while (match !== null) {
          const url = match[2];
          if (url && !isExternalOrAnchor(url)) {
            const noFrag = stripFragment(url);
            if (noFrag !== "" && !noFrag.startsWith("data:")) {
              const target = resolveLink(repoRoot, f, url);
              if (!existsSync(target)) {
                issues.push({
                  linter: this.id,
                  severity: "error",
                  file: f,
                  line: lineNo + 1,
                  message: `broken link: ${url}`,
                });
              }
            }
          }
          match = LINK_REGEX.exec(line);
        }
      }
    }
    return issues;
  },
};
