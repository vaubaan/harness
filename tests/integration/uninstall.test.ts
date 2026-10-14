import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME } from "../../src/cli/manifest.js";
import { uninstallCommand } from "../../src/cli/uninstall.js";

const PACKAGE_DIR = resolve(__dirname, "..", "..", "src");

let sandbox: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cah-uninstall-"));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("uninstallCommand", () => {
  it("removes every file listed in the manifest and prunes emptied dirs", () => {
    const init = initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    expect(init.filesWritten.length).toBeGreaterThan(0);
    expect(existsSync(join(sandbox, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(sandbox, ".claude"))).toBe(true);

    const result = uninstallCommand({ targetDir: sandbox });

    expect(result.warnings).toEqual([]);
    expect(result.filesRemoved.sort()).toEqual([...init.filesWritten].sort());
    expect(existsSync(join(sandbox, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(sandbox, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(sandbox, ".claude"))).toBe(false);
    expect(existsSync(join(sandbox, MANIFEST_FILENAME))).toBe(false);
    expect(readdirSync(sandbox)).toEqual([]);
  });

  it("is a no-op (with warning) when no manifest is present", () => {
    const result = uninstallCommand({ targetDir: sandbox });
    expect(result.filesRemoved).toEqual([]);
    expect(result.dirsPruned).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/no manifest found/);
  });

  it("preserves user files that are not in the manifest", () => {
    initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });

    const customDir = join(sandbox, ".claude", "skills", "user-custom");
    writeFileSync(join(sandbox, "user-notes.md"), "personal notes\n");
    writeFileSync(join(sandbox, ".claude", "config.json"), "{}\n");
    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, "SKILL.md"), "custom\n");

    uninstallCommand({ targetDir: sandbox });

    expect(existsSync(join(sandbox, "user-notes.md"))).toBe(true);
    expect(existsSync(join(sandbox, ".claude", "config.json"))).toBe(true);
    expect(existsSync(join(customDir, "SKILL.md"))).toBe(true);
    expect(existsSync(join(sandbox, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(sandbox, MANIFEST_FILENAME))).toBe(false);
  });

  it("supports init → uninstall → reinstall cycle", () => {
    const first = initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    uninstallCommand({ targetDir: sandbox });
    const second = initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    expect(second.filesWritten.sort()).toEqual([...first.filesWritten].sort());
    expect(existsSync(join(sandbox, MANIFEST_FILENAME))).toBe(true);
  });
});
