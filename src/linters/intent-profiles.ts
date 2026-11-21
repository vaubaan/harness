import { readIntentFiles } from "../parser/intent.js";
import { PROFILES_DIR, readProfileFiles } from "../parser/profile.js";
import type { LintIssue, Linter } from "./types.js";
import { dirExists } from "./util.js";

/**
 * The link from the intents to the profiles (docs/spec/coding-agent-harness.md
 * §9.1.4). A check between two pillars runs only while both are active:
 * with intents alone, actors stay free strings and only a dangling
 * `relieves:` / `delivers:` is reported.
 */
export const intentProfiles: Linter = {
  id: "lint:intent-profiles",
  pillars: ["intents", "profiles"],
  defaultSeverity: "error",
  suggestedSkills: ["/intent"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    const intentFiles = readIntentFiles(repoRoot);
    const profilesActive = dirExists(repoRoot, PROFILES_DIR);
    const profiles = new Map(readProfileFiles(repoRoot).map((p) => [p.slug, p]));
    for (const intentFile of intentFiles) {
      const report = (message: string, line?: number): void => {
        issues.push({
          linter: this.id,
          severity: "error",
          file: intentFile.path,
          ...(line !== undefined ? { line } : {}),
          message,
        });
      };
      const actors = intentFile.meta?.actors ?? [];
      if (profilesActive) {
        for (const actor of actors) {
          if (!profiles.has(actor)) {
            report(`actor \`${actor}\` is not a profile: no ${PROFILES_DIR}/${actor}.md`, 1);
          }
        }
      }
      const theirs = actors.flatMap((actor) => profiles.get(actor) ?? []);
      const pains = new Set(theirs.flatMap((p) => p.pains.map((item) => item.slug)));
      const gains = new Set(theirs.flatMap((p) => p.gains.map((item) => item.slug)));
      for (const node of intentFile.nodes) {
        const fields = [
          { key: "relieves", values: node.relieves, known: pains, kind: "pain" },
          { key: "delivers", values: node.delivers, known: gains, kind: "gain" },
        ] as const;
        for (const { key, values, known, kind } of fields) {
          if (values.length === 0) continue;
          const line = node.fieldLines[key] ?? node.line;
          if (!profilesActive) {
            report(
              `"${node.title}": \`${key}:\` needs the profiles pillar — \`npx @vaubaan/harness add profiles\``,
              line,
            );
            continue;
          }
          for (const slug of values) {
            if (!known.has(slug)) {
              report(
                `"${node.title}": \`${slug}\` is not a ${kind} of ${
                  actors.length ? actors.map((a) => `\`${a}\``).join(", ") : "any actor"
                }`,
                line,
              );
            }
          }
        }
      }
    }
    return issues;
  },
};
