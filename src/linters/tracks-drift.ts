import fg from "fast-glob";
import { parseIntentFile } from "../parser/intent.js";
import type { LintIssue, Linter } from "./types.js";
import {
  gitCommitsSince,
  gitLastCommitForPath,
  listMarkdown,
  parseFrontmatter,
  readText,
} from "./util.js";

const TRACKED_DIRS = ["docs/handbook", "docs/tests", "docs/workflow"];
/** An intent file declares no `tracks:`: its tracked paths are the union of its nodes' anchors. */
const INTENTS_DIR = "docs/intents";
const DEFAULT_DRIFT_THRESHOLD = 10;

function expandGlob(repoRoot: string, pattern: string): string[] {
  if (pattern.includes("*")) {
    return fg.sync(pattern, { cwd: repoRoot, absolute: false });
  }
  return [pattern];
}

function trackedPaths(dir: string, file: string, text: string, data: Record<string, unknown>) {
  if (dir === INTENTS_DIR) {
    const anchors = parseIntentFile(file, text).nodes.flatMap((node) => node.anchors);
    return anchors.length > 0 ? [...new Set(anchors)] : undefined;
  }
  return Array.isArray(data.tracks) ? (data.tracks as unknown[]) : undefined;
}

export interface Drift {
  /** Commits on the tracked paths since the doc's last commit. */
  commits: number;
  threshold: number;
  /** The tracked paths: `tracks:`, or the union of an intent file's anchors. */
  tracked: string[];
}

/**
 * The drift of one doc, or `undefined` when it tracks nothing or was never
 * committed. Shared by the linter and the context graph.
 */
export function driftOf(repoRoot: string, file: string): Drift | undefined {
  const dir =
    TRACKED_DIRS.find((d) => file.startsWith(`${d}/`)) ??
    (file.startsWith(`${INTENTS_DIR}/`) ? INTENTS_DIR : undefined);
  if (!dir) return undefined;
  const text = readText(repoRoot, file);
  const { data } = parseFrontmatter(text);
  const tracks = trackedPaths(dir, file, text, data);
  if (!tracks) return undefined;
  const docCommit = gitLastCommitForPath(repoRoot, file);
  if (!docCommit) return undefined;
  const threshold =
    typeof data.driftThreshold === "number" && data.driftThreshold > 0
      ? data.driftThreshold
      : DEFAULT_DRIFT_THRESHOLD;
  let commits = 0;
  const tracked: string[] = [];
  for (const entry of tracks) {
    if (typeof entry !== "string") continue;
    tracked.push(entry);
    const targets = expandGlob(repoRoot, entry);
    for (const t of targets.length > 0 ? targets : [entry]) {
      commits += gitCommitsSince(repoRoot, t, docCommit.hash);
    }
  }
  return { commits, threshold, tracked };
}

export const tracksDrift: Linter = {
  id: "lint:tracks-drift",
  pillars: ["handbook", "tests", "workflow", "intents"],
  defaultSeverity: "warning",
  suggestedSkills: ["/drift", "/handbook"],
  run(repoRoot: string): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const dir of [...TRACKED_DIRS, INTENTS_DIR]) {
      for (const f of listMarkdown(repoRoot, dir)) {
        const drift = driftOf(repoRoot, f);
        if (!drift || drift.commits <= drift.threshold) continue;
        issues.push({
          linter: this.id,
          severity: "warning",
          file: f,
          message: `tracked files changed in ${drift.commits} commits since doc last edit (threshold ${drift.threshold})`,
        });
      }
    }
    return issues;
  },
};
