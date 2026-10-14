import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RenderedFile } from "../types.js";
import { initCommand, writeFilesToTarget } from "./init.js";

// src/ is a valid packageDir — it contains agents/, skills/, commands/.
const PACKAGE_DIR = join(__dirname, "..");

let targetDir: string;

beforeEach(() => {
  targetDir = mkdtempSync(join(tmpdir(), "cah-init-"));
});

afterEach(() => {
  rmSync(targetDir, { recursive: true, force: true });
});

describe("initCommand", () => {
  it("throws for an unknown engine name", () => {
    expect(() =>
      initCommand({ targetDir, engines: ["bad-engine"], packageDir: PACKAGE_DIR }),
    ).toThrow("unknown engine: bad-engine");
  });

  it("with no engines writes files including AGENTS.md", () => {
    const result = initCommand({ targetDir, packageDir: PACKAGE_DIR });
    expect(result.filesWritten.length).toBeGreaterThan(0);
    expect(result.filesWritten).toContain("AGENTS.md");
  });

  it("with engines: ['claude-code'] writes files and stopHookInstalled is true", () => {
    const result = initCommand({
      targetDir,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten.length).toBeGreaterThan(0);
    expect(result.stopHookInstalled).toBe(true);
  });

  it("with withStopHook: false sets stopHookInstalled to false", () => {
    const result = initCommand({
      targetDir,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
      withStopHook: false,
    });
    expect(result.stopHookInstalled).toBe(false);
  });
});

describe("writeFilesToTarget", () => {
  it("creates subdirectories recursively and returns written paths", () => {
    const files: RenderedFile[] = [
      { path: ".claude/skills/example/SKILL.md", content: "hello" },
      { path: "AGENTS.md", content: "world" },
    ];
    const written = writeFilesToTarget(files, targetDir);
    expect(written).toEqual([".claude/skills/example/SKILL.md", "AGENTS.md"]);
    expect(existsSync(join(targetDir, ".claude/skills/example/SKILL.md"))).toBe(true);
    expect(existsSync(join(targetDir, "AGENTS.md"))).toBe(true);
  });
});
