import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { LintState } from "./types.js";

const LintStateSchema = z.object({
  attempts: z.number().int().nonnegative(),
  lastLintHash: z.string(),
  updatedAt: z.string(),
});

export const STATE_DIR = ".harness/state";

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "default";
}

export function statePath(cwd: string, sessionId: string): string {
  return join(cwd, STATE_DIR, `lint-${safeSessionId(sessionId)}.json`);
}

export function readState(cwd: string, sessionId: string): LintState | null {
  const path = statePath(cwd, sessionId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return LintStateSchema.parse(raw);
  } catch {
    return null;
  }
}

export function writeState(cwd: string, sessionId: string, state: LintState): void {
  const path = statePath(cwd, sessionId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function resetState(cwd: string, sessionId: string): void {
  const path = statePath(cwd, sessionId);
  if (existsSync(path)) rmSync(path, { force: true });
}
