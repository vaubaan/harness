import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import fg from "fast-glob";
import { isExternalOrAnchor, readLinks, stripFragment } from "../parser/docs.js";
import type { LintContext, LintIssue, Linter } from "./types.js";
import { readText } from "./util.js";

/** The Markdown files whose links are checked, and that the context graph links. */
export const LINKED_DOC_IGNORES: ReadonlyArray<string> = [
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
];

/** A relative link of `sourceFile` as an absolute path. */
export function resolveLink(repoRoot: string, sourceFile: string, link: string): string {
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
      ignore: [...LINKED_DOC_IGNORES, ...extra],
    });
    for (const f of allDocs) {
      for (const { url, line } of readLinks(readText(repoRoot, f))) {
        if (isExternalOrAnchor(url)) continue;
        const noFrag = stripFragment(url);
        if (noFrag === "" || noFrag.startsWith("data:")) continue;
        if (!existsSync(resolveLink(repoRoot, f, url))) {
          issues.push({
            linter: this.id,
            severity: "error",
            file: f,
            line,
            message: `broken link: ${url}`,
          });
        }
      }
    }
    return issues;
  },
};
