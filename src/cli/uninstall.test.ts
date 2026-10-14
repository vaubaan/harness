import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MANIFEST_FILENAME, MANIFEST_VERSION } from "./manifest.js";
import { removeRenderedFiles, uninstallCommand } from "./uninstall.js";

let root: string;

function write(rel: string, content = "") {
  const full = join(root, rel);
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
}

function writeManifestFile(files: string[]) {
  writeFileSync(
    join(root, MANIFEST_FILENAME),
    `${JSON.stringify(
      { version: MANIFEST_VERSION, engines: [], renderedAt: new Date().toISOString(), files },
      null,
      2,
    )}\n`,
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-uninstall-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("uninstallCommand", () => {
  it("returns a warning and empty lists when no manifest exists", () => {
    const result = uninstallCommand({ targetDir: root });
    expect(result.filesRemoved).toHaveLength(0);
    expect(result.dirsPruned).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("no manifest found at");
    expect(result.warnings[0]).toContain("nothing to uninstall");
  });

  it("removes files listed in the manifest and returns their paths", () => {
    write(".claude/agents/foo.md", "# agent");
    write(".claude/settings.json", "{}");
    writeManifestFile([".claude/agents/foo.md", ".claude/settings.json"]);

    const result = uninstallCommand({ targetDir: root });
    expect(result.filesRemoved).toContain(".claude/agents/foo.md");
    expect(result.filesRemoved).toContain(".claude/settings.json");
    expect(result.warnings).toHaveLength(0);
    expect(existsSync(join(root, ".claude/agents/foo.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/settings.json"))).toBe(false);
  });

  it("adds a warning for each file in the manifest that is already missing", () => {
    write(".claude/agents/present.md", "exists");
    writeManifestFile([".claude/agents/present.md", ".claude/agents/ghost.md"]);

    const result = uninstallCommand({ targetDir: root });
    expect(result.filesRemoved).toEqual([".claude/agents/present.md"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toBe("file in manifest is already missing: .claude/agents/ghost.md");
  });

  it("prunes empty directories after file removal, deepest-first", () => {
    write(".claude/agents/deep/file.md", "x");
    writeManifestFile([".claude/agents/deep/file.md"]);

    const result = uninstallCommand({ targetDir: root });
    expect(result.dirsPruned).toContain(".claude/agents/deep");
    expect(result.dirsPruned).toContain(".claude/agents");
    expect(result.dirsPruned).toContain(".claude");
    // deepest dir appears before its parent
    expect(result.dirsPruned.indexOf(".claude/agents/deep")).toBeLessThan(
      result.dirsPruned.indexOf(".claude/agents"),
    );
    expect(existsSync(join(root, ".claude"))).toBe(false);
  });

  it("deletes the manifest file itself", () => {
    write("AGENTS.md", "# agents");
    writeManifestFile(["AGENTS.md"]);
    const manifestFull = join(root, MANIFEST_FILENAME);
    expect(existsSync(manifestFull)).toBe(true);

    uninstallCommand({ targetDir: root });
    expect(existsSync(manifestFull)).toBe(false);
  });

  it("validates the complete manifest before removing its first valid file", () => {
    write("outside.txt", "keep user file");
    const nestedRoot = join(root, "project");
    mkdirSync(nestedRoot);
    writeFileSync(join(nestedRoot, "AGENTS.md"), "keep managed file");
    writeFileSync(
      join(nestedRoot, MANIFEST_FILENAME),
      JSON.stringify({
        version: MANIFEST_VERSION,
        engines: [],
        renderedAt: new Date().toISOString(),
        files: ["AGENTS.md", "../outside.txt"],
      }),
    );

    expect(() => uninstallCommand({ targetDir: nestedRoot })).toThrow(/unsafe harness path/);
    expect(readFileSync(join(nestedRoot, "AGENTS.md"), "utf8")).toBe("keep managed file");
    expect(readFileSync(join(root, "outside.txt"), "utf8")).toBe("keep user file");
    expect(existsSync(join(nestedRoot, MANIFEST_FILENAME))).toBe(true);
  });

  it("rejects a symbolic parent before removing any preceding file", () => {
    write("AGENTS.md", "keep managed file");
    write("outside/coding.toml", "keep outside file");
    mkdirSync(join(root, ".codex"));
    symlinkSync(join(root, "outside"), join(root, ".codex/agents"), "dir");
    writeManifestFile(["AGENTS.md", ".codex/agents/coding.toml"]);

    expect(() => uninstallCommand({ targetDir: root })).toThrow(/symbolic link/);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("keep managed file");
    expect(readFileSync(join(root, "outside/coding.toml"), "utf8")).toBe("keep outside file");
    expect(existsSync(join(root, MANIFEST_FILENAME))).toBe(true);
  });

  it("rejects a manifest symlink without touching the linked manifest or its files", () => {
    write("AGENTS.md", "keep managed file");
    write("outside-manifest.json", JSON.stringify({ version: MANIFEST_VERSION, files: [] }));
    symlinkSync(join(root, "outside-manifest.json"), join(root, MANIFEST_FILENAME));

    expect(() => uninstallCommand({ targetDir: root })).toThrow(/symbolic link/);
    expect(existsSync(join(root, "outside-manifest.json"))).toBe(true);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  });
});

describe("removeRenderedFiles", () => {
  it("validates all locations before deleting any files", () => {
    write("AGENTS.md", "keep managed file");
    write("README.md", "keep project file");
    expect(() => removeRenderedFiles(root, ["AGENTS.md", "README.md"])).toThrow(
      /outside harness-managed locations/,
    );
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(root, "README.md"))).toBe(true);
  });
});
