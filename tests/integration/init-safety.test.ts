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
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand, writeFilesToTarget } from "../../src/cli/init.js";
import { MANIFEST_FILENAME } from "../../src/cli/manifest.js";

const PACKAGE_DIR = resolve(__dirname, "../../src");
let sandbox: string;
let root: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cah-init-safety-"));
  root = join(sandbox, "project");
  mkdirSync(root);
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function install() {
  return initCommand({
    targetDir: root,
    engines: ["claude-code"],
    packageDir: PACKAGE_DIR,
  });
}
function manifest(files: string[]) {
  writeFileSync(
    join(root, MANIFEST_FILENAME),
    JSON.stringify({
      version: "4",
      engines: ["codex-cli"],
      renderedAt: new Date().toISOString(),
      files,
    }),
  );
}

describe("init preflight before any mutation", () => {
  it("rejects a traversal after a valid stale path without deleting either file", () => {
    mkdirSync(join(root, ".codex/agents"), { recursive: true });
    writeFileSync(join(root, ".codex/agents/old.md"), "old");
    writeFileSync(join(sandbox, "outside.txt"), "keep");
    manifest([".codex/agents/old.md", "../outside.txt"]);
    const before = readFileSync(join(root, MANIFEST_FILENAME), "utf8");
    expect(install).toThrow(/unsafe harness path/);
    expect(readFileSync(join(sandbox, "outside.txt"), "utf8")).toBe("keep");
    expect(readFileSync(join(root, ".codex/agents/old.md"), "utf8")).toBe("old");
    expect(readFileSync(join(root, MANIFEST_FILENAME), "utf8")).toBe(before);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("rejects a symlink on a new output before cleaning old files", () => {
    mkdirSync(join(root, ".codex/agents"), { recursive: true });
    writeFileSync(join(root, ".codex/agents/old.md"), "old");
    manifest([".codex/agents/old.md"]);
    const outside = join(sandbox, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(root, ".claude"), "dir");
    expect(install).toThrow(/symbolic link/);
    expect(existsSync(join(root, ".codex/agents/old.md"))).toBe(true);
    expect(existsSync(join(outside, "agents"))).toBe(false);
  });

  it("refuses a linked manifest instead of falling back to an empty install", () => {
    const outside = join(sandbox, "manifest.json");
    writeFileSync(outside, "{}");
    symlinkSync(outside, join(root, MANIFEST_FILENAME));
    expect(install).toThrow(/symbolic link/);
    expect(readFileSync(outside, "utf8")).toBe("{}");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("rejects invalid manifests before overwriting any generated files", () => {
    writeFileSync(join(root, "AGENTS.md"), "keep");
    writeFileSync(join(root, MANIFEST_FILENAME), "{broken");
    expect(install).toThrow();
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("keep");
  });

  it("validates a whole output batch before writing its first file", () => {
    expect(() =>
      writeFilesToTarget(
        [
          { path: "AGENTS.md", content: "new" },
          { path: "../outside.txt", content: "bad" },
        ],
        root,
      ),
    ).toThrow(/unsafe harness path/);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(sandbox, "outside.txt"))).toBe(false);
  });
});
