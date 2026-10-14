import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decide } from "./core.js";
import { readState, writeState } from "./state.js";
import type { CoreEnv, LintRunResult, NormalizedPayload } from "./types.js";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "cah-core-"));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function mkEnv(dirty: string, lint: LintRunResult, env: NodeJS.ProcessEnv = {}): CoreEnv {
  return { cwd, env, gitStatus: () => dirty, runLint: () => lint };
}

const LINT_FAIL = (
  output = "README.md: error[lint:readme-presence]\n  missing",
): LintRunResult => ({
  pass: false,
  output,
});
const LINT_PASS: LintRunResult = { pass: true, output: "0 errors. ✔ CI passes." };

const PAYLOAD: NormalizedPayload = { sessionId: "session-A", stopHookActive: false };

describe("decide — Stop-hook anti-loop logic", () => {
  it("kill switch (HARNESS_LINT_DISABLE=1) → passthrough regardless of dirty/lint state", () => {
    const out = decide(PAYLOAD, mkEnv(" M file.md", LINT_FAIL(), { HARNESS_LINT_DISABLE: "1" }));
    expect(out.kind).toBe("passthrough");
  });

  it("stopHookActive=true → passthrough (Claude/Codex built-in flag)", () => {
    const out = decide({ ...PAYLOAD, stopHookActive: true }, mkEnv(" M file.md", LINT_FAIL()));
    expect(out.kind).toBe("passthrough");
  });

  it("clean worktree → passthrough and resets any prior state (lint not even invoked)", () => {
    writeState(cwd, PAYLOAD.sessionId, {
      attempts: 2,
      lastLintHash: "old",
      updatedAt: "t",
    });
    const out = decide(PAYLOAD, mkEnv("", LINT_FAIL()));
    expect(out.kind).toBe("passthrough");
    expect(readState(cwd, PAYLOAD.sessionId)).toBeNull();
  });

  it("dirty + lint clean → passthrough + reset state", () => {
    writeState(cwd, PAYLOAD.sessionId, {
      attempts: 1,
      lastLintHash: "old",
      updatedAt: "t",
    });
    const out = decide(PAYLOAD, mkEnv(" M file.md", LINT_PASS));
    expect(out.kind).toBe("passthrough");
    expect(readState(cwd, PAYLOAD.sessionId)).toBeNull();
  });

  it("first dirty + lint fail → inject lint output + attempts=1", () => {
    const out = decide(PAYLOAD, mkEnv(" M file.md", LINT_FAIL("LINT_OUTPUT_X")));
    expect(out.kind).toBe("inject");
    expect(out.reason).toBe("LINT_OUTPUT_X");
    const state = readState(cwd, PAYLOAD.sessionId);
    expect(state?.attempts).toBe(1);
    expect(state?.lastLintHash).toBeTruthy();
  });

  it("second Stop with identical lint output → terminate (no-progress guard)", () => {
    const env1 = mkEnv(" M file.md", LINT_FAIL("LINT_SAME"));
    const env2 = mkEnv(" M file.md\n M other.md", LINT_FAIL("LINT_SAME"));
    decide(PAYLOAD, env1);
    const out = decide(PAYLOAD, env2);
    expect(out.kind).toBe("terminate");
    expect(out.reason).toMatch(/no progress between attempts/i);
    expect(out.reason).toContain("LINT_SAME");
    expect(readState(cwd, PAYLOAD.sessionId)).toBeNull();
  });

  it("second Stop with different lint output → inject + attempts=2", () => {
    decide(PAYLOAD, mkEnv(" M file.md", LINT_FAIL("FIRST")));
    const out = decide(PAYLOAD, mkEnv(" M file.md", LINT_FAIL("SECOND_DIFFERENT")));
    expect(out.kind).toBe("inject");
    expect(out.reason).toBe("SECOND_DIFFERENT");
    expect(readState(cwd, PAYLOAD.sessionId)?.attempts).toBe(2);
  });

  it("exceeding MAX_ATTEMPTS → terminate + reset, reason carries final lint output", () => {
    writeState(cwd, PAYLOAD.sessionId, {
      attempts: 3,
      lastLintHash: "prev",
      updatedAt: "t",
    });
    const out = decide(PAYLOAD, mkEnv(" M new.md", LINT_FAIL("FINAL_OUTPUT")));
    expect(out.kind).toBe("terminate");
    expect(out.reason).toMatch(/still failing after 3 attempts/i);
    expect(out.reason).toContain("FINAL_OUTPUT");
    expect(readState(cwd, PAYLOAD.sessionId)).toBeNull();
  });

  it("HARNESS_LINT_MAX_ATTEMPTS override is honored", () => {
    writeState(cwd, PAYLOAD.sessionId, {
      attempts: 1,
      lastLintHash: "prev",
      updatedAt: "t",
    });
    const out = decide(
      PAYLOAD,
      mkEnv(" M new.md", LINT_FAIL(), { HARNESS_LINT_MAX_ATTEMPTS: "1" }),
    );
    expect(out.kind).toBe("terminate");
  });

  it("each session id is tracked independently", () => {
    decide(PAYLOAD, mkEnv(" M file.md", LINT_FAIL("S1")));
    const out = decide(
      { sessionId: "session-B", stopHookActive: false },
      mkEnv(" M file.md", LINT_FAIL("S2")),
    );
    expect(out.kind).toBe("inject");
    expect(readState(cwd, "session-A")?.attempts).toBe(1);
    expect(readState(cwd, "session-B")?.attempts).toBe(1);
  });
});
