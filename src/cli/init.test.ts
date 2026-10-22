import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RenderedFile } from "../types.js";
import { initCommand, writeFilesToTarget } from "./init.js";

// src/ is a valid packageDir — it contains skills/ and commands/.
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

  it("requires an engine selection and writes nothing without one", () => {
    expect(() => initCommand({ targetDir, engines: [], packageDir: PACKAGE_DIR })).toThrow(
      /no engine selected/,
    );
    expect(existsSync(join(targetDir, "AGENTS.md"))).toBe(false);
  });

  it("with engines: ['claude-code'] writes files including AGENTS.md and CLAUDE.md", () => {
    const result = initCommand({
      targetDir,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten.length).toBeGreaterThan(0);
    expect(result.filesWritten).toContain("AGENTS.md");
    expect(result.filesWritten).toContain("CLAUDE.md");
    expect(result.engines).toEqual(["claude-code"]);
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
