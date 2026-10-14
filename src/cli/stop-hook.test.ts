import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopHookCommand } from "./stop-hook.js";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "cah-cli-sh-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd });
  execFileSync("git", ["config", "user.name", "T"], { cwd });
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("stopHookCommand — CLI dispatch", () => {
  it("dispatches Claude payload to claudeAdapter and injects on dirty + lint fail", () => {
    writeFileSync(join(cwd, "dirty.md"), "x");
    const result = stopHookCommand(
      { engine: "claude", cwd },
      JSON.stringify({ session_id: "abc", stop_hook_active: false }),
    );
    const body = JSON.parse(result.stdout);
    expect(body.decision).toBe("block");
    expect(body.reason).toMatch(/lint:/);
    expect(result.exitCode).toBe(0);
  });

  it("Claude passthrough when stop_hook_active=true", () => {
    writeFileSync(join(cwd, "dirty.md"), "x");
    const result = stopHookCommand(
      { engine: "claude", cwd },
      JSON.stringify({ session_id: "abc", stop_hook_active: true }),
    );
    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("opencode dispatches with exit 2 + lint report on stderr when dirty + lint fail", () => {
    writeFileSync(join(cwd, "dirty.md"), "x");
    const result = stopHookCommand(
      { engine: "opencode", cwd },
      JSON.stringify({ sessionID: "oc-1" }),
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/lint:/);
  });

  it("clean worktree → passthrough across all engines", () => {
    for (const engine of ["claude", "codex", "opencode"] as const) {
      const result = stopHookCommand(
        { engine, cwd },
        JSON.stringify({ session_id: `${engine}-1`, sessionID: `${engine}-1` }),
      );
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    }
  });

  it("rejects unknown engine", () => {
    expect(() => stopHookCommand({ engine: "vim", cwd }, "{}")).toThrow(/unknown engine/);
  });
});

describe("stopHookCommand — retired runner isolation", () => {
  it.each([
    ["claude", false],
    ["claude", true],
    ["codex", false],
    ["codex", true],
    ["opencode", false],
    ["opencode", true],
  ] as const)("%s preserves the old journal without warnings (dirty=%s)", (engine, dirty) => {
    const logFile = join(cwd, ".git", "retired-runner.log");
    const historicalLog = "historical event\n";
    writeFileSync(logFile, historicalLog);
    vi.stubEnv("CAR_TURN_END_LOG", logFile);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      if (dirty) writeFileSync(join(cwd, "dirty.md"), "x");
      const result = stopHookCommand(
        { engine, cwd },
        JSON.stringify({ session_id: "retired", sessionID: "retired", stop_hook_active: false }),
      );
      expect(readFileSync(logFile, "utf8")).toBe(historicalLog);
      expect(stderrSpy).not.toHaveBeenCalled();
      if (dirty) {
        if (engine === "opencode") {
          expect(result.exitCode).toBe(2);
          expect(result.stderr).toMatch(/lint:/);
        } else {
          expect(JSON.parse(result.stdout).decision).toBe("block");
        }
      } else {
        expect(result).toEqual({ stdout: "", stderr: "", exitCode: 0 });
      }
    } finally {
      stderrSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
