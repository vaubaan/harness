import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readState, resetState, statePath, writeState } from "./state.js";

let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "cah-state-"));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("stop-hook state", () => {
  it("returns null when no state file exists", () => {
    expect(readState(cwd, "session-A")).toBeNull();
  });

  it("write → read round-trip", () => {
    writeState(cwd, "session-A", {
      attempts: 2,
      lastLintHash: "abc123",
      updatedAt: "2026-06-01T00:00:00Z",
    });
    expect(readState(cwd, "session-A")).toEqual({
      attempts: 2,
      lastLintHash: "abc123",
      updatedAt: "2026-06-01T00:00:00Z",
    });
  });

  it("reset deletes the state file", () => {
    writeState(cwd, "session-A", {
      attempts: 1,
      lastLintHash: "x",
      updatedAt: "2026-06-01T00:00:00Z",
    });
    expect(existsSync(statePath(cwd, "session-A"))).toBe(true);
    resetState(cwd, "session-A");
    expect(existsSync(statePath(cwd, "session-A"))).toBe(false);
  });

  it("reset is a no-op when file already missing", () => {
    expect(() => resetState(cwd, "never-existed")).not.toThrow();
  });

  it("isolates state per session id", () => {
    writeState(cwd, "session-A", {
      attempts: 1,
      lastLintHash: "a",
      updatedAt: "t",
    });
    writeState(cwd, "session-B", {
      attempts: 5,
      lastLintHash: "b",
      updatedAt: "t",
    });
    expect(readState(cwd, "session-A")?.attempts).toBe(1);
    expect(readState(cwd, "session-B")?.attempts).toBe(5);
  });

  it("sanitizes session id with unsafe characters into the file path", () => {
    const path = statePath(cwd, "session/with weird: chars");
    expect(path).not.toMatch(/[/: ]/.source.replace("/", ""));
    expect(path).toMatch(/lint-session_with_weird__chars\.json$/);
  });

  it("returns null when the on-disk JSON is corrupt", () => {
    writeState(cwd, "session-A", {
      attempts: 1,
      lastLintHash: "ok",
      updatedAt: "t",
    });
    const fs = require("node:fs");
    fs.writeFileSync(statePath(cwd, "session-A"), "{not json");
    expect(readState(cwd, "session-A")).toBeNull();
  });
});
