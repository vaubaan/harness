import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { formatReportText, runLinters } from "../linters/index.js";
import { readState, resetState, writeState } from "./state.js";
import {
  type CoreEnv,
  DEFAULT_MAX_ATTEMPTS,
  type Decision,
  type LintRunResult,
  type NormalizedPayload,
} from "./types.js";

function exhaustedReason(attempts: number, lintOutput: string): string {
  return `Harness lint: still failing after ${attempts} attempts.\n\n${lintOutput}`;
}

function noProgressReason(lintOutput: string): string {
  return `Harness lint: no progress between attempts.\n\n${lintOutput}`;
}

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function maxAttempts(env: NodeJS.ProcessEnv): number {
  const raw = env.HARNESS_LINT_MAX_ATTEMPTS;
  if (!raw) return DEFAULT_MAX_ATTEMPTS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ATTEMPTS;
}

export function defaultGitStatus(cwd: string): string {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

export function defaultRunLint(cwd: string): LintRunResult {
  const report = runLinters(cwd);
  return { pass: report.summary.pass, output: formatReportText(report) };
}

/**
 * Pure decision function for the Stop-hook lint loop. Inputs are the
 * normalized payload from the engine adapter and a {@link CoreEnv}
 * abstracting filesystem-touching operations (git status, lint runner,
 * env vars, cwd) so tests can drive each branch without hitting disk
 * or invoking the actual linters.
 *
 * Branches (in order):
 *   1. kill switch HARNESS_LINT_DISABLE=1            → passthrough
 *   2. engine flag stopHookActive === true           → passthrough
 *   3. git clean (no dirty files)                    → reset + passthrough
 *   4. lint pass                                     → reset + passthrough
 *   5. lint fail, same output as previous attempt    → reset + terminate (no progress)
 *   6. lint fail, attempts+1 > MAX_ATTEMPTS          → reset + terminate (exhausted)
 *   7. lint fail, otherwise                          → persist + inject lint output
 */
export function decide(payload: NormalizedPayload, coreEnv: CoreEnv): Decision {
  if (coreEnv.env.HARNESS_LINT_DISABLE === "1") {
    return { kind: "passthrough" };
  }
  if (payload.stopHookActive) {
    return { kind: "passthrough" };
  }

  const dirty = coreEnv.gitStatus(coreEnv.cwd);
  if (dirty.trim() === "") {
    resetState(coreEnv.cwd, payload.sessionId);
    return { kind: "passthrough" };
  }

  const lintResult = coreEnv.runLint(coreEnv.cwd);
  if (lintResult.pass) {
    resetState(coreEnv.cwd, payload.sessionId);
    return { kind: "passthrough" };
  }

  const lintHash = hash(lintResult.output);
  const prev = readState(coreEnv.cwd, payload.sessionId);

  if (prev && prev.attempts > 0 && prev.lastLintHash === lintHash) {
    resetState(coreEnv.cwd, payload.sessionId);
    return { kind: "terminate", reason: noProgressReason(lintResult.output) };
  }

  const nextAttempts = (prev?.attempts ?? 0) + 1;
  const limit = maxAttempts(coreEnv.env);
  if (nextAttempts > limit) {
    resetState(coreEnv.cwd, payload.sessionId);
    return { kind: "terminate", reason: exhaustedReason(limit, lintResult.output) };
  }

  writeState(coreEnv.cwd, payload.sessionId, {
    attempts: nextAttempts,
    lastLintHash: lintHash,
    updatedAt: new Date().toISOString(),
  });
  return { kind: "inject", reason: lintResult.output };
}
