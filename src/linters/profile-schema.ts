import { posix } from "node:path";
import { profileEvidence, readProfileFiles } from "../parser/profile.js";
import type { LintIssue, Linter } from "./types.js";
import { fileExists } from "./util.js";

/** `https://…`, `mailto:…`: evidence kept outside the repo, never resolved. */
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The grammar of the profiles pillar (docs/spec/coding-agent-harness.md
 * §9.1.4). No effect when `docs/profiles/` is absent.
 */
export const profileSchema: Linter = {
  id: "lint:profile-schema",
  pillars: ["profiles"],
  defaultSeverity: "error",
  suggestedSkills: ["/intent"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const profile of readProfileFiles(repoRoot)) {
      const report = (message: string, line?: number): void => {
        issues.push({
          linter: this.id,
          severity: "error",
          file: profile.path,
          ...(line !== undefined ? { line } : {}),
          message,
        });
      };
      for (const error of profile.errors) report(error.message, error.line);
      const evidence = profileEvidence(profile.meta);
      if (profile.meta?.status === "validated" && evidence.length === 0) {
        report("a `validated` profile needs `evidence:` — without it, it is a `hypothesis`", 1);
      }
      for (const link of evidence) {
        if (EXTERNAL.test(link)) continue;
        const target = posix.normalize(
          posix.join(posix.dirname(profile.path), link.split("#")[0] ?? ""),
        );
        if (!fileExists(repoRoot, target)) report(`\`evidence\` does not resolve: ${link}`, 1);
      }
    }
    return issues;
  },
};
