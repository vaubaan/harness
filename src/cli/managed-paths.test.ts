import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertManagedPaths } from "./managed-paths.js";

let sandbox: string;
let root: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cah-managed-paths-"));
  root = join(sandbox, "project");
  mkdirSync(root);
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("assertManagedPaths", () => {
  it("accepts current and legacy managed layouts without creating a target", () => {
    const missingRoot = join(sandbox, "missing", "project");
    expect(() =>
      assertManagedPaths(missingRoot, [
        "AGENTS.md",
        "CLAUDE.md",
        ".mcp.json",
        ".harness-manifest.json",
        ".claude/settings.json",
        ".claude/agents/coding.md",
        ".claude/commands/decision.md",
        ".claude/skills/doc-audit/SKILL.md",
        ".codex/config.toml",
        ".codex/hooks.json",
        ".codex/agents/coding.toml",
        ".codex/agents/coding.md",
        ".codex/commands/decision.md",
        ".codex/skills/doc-audit.md",
        ".agents/skills/doc-audit/SKILL.md",
        ".opencode/opencode.json",
        ".opencode/mcp.json",
        ".opencode/agents/review.md",
        ".opencode/commands/decision.md",
        ".opencode/skills/doc-audit/SKILL.md",
        ".opencode/plugins/doc-audit/index.md",
        ".opencode/plugins/harness-stop-hook.ts",
      ]),
    ).not.toThrow();
    expect(existsSync(missingRoot)).toBe(false);
  });

  it.each([
    "../outside.txt",
    ".codex/../AGENTS.md",
    "/tmp/AGENTS.md",
    "C:\\project\\AGENTS.md",
    "C:/project/AGENTS.md",
    "\\\\server\\share\\AGENTS.md",
    ".codex\\agents\\coding.toml",
    ".codex//agents/coding.toml",
    "./AGENTS.md",
    ".codex/agents/./coding.toml",
    ".codex/agents/coding\0.toml",
    "",
  ])("rejects unsafe path %j", (path) => {
    expect(() => assertManagedPaths(root, [path])).toThrow(/unsafe harness path/);
  });

  it.each(["README.md", "docs/spec/api.md", ".git/config", ".codex/auth.json", ".agents/foo.md"])(
    "rejects unrelated project path %j",
    (path) => {
      expect(() => assertManagedPaths(root, [path])).toThrow(/outside harness-managed locations/);
    },
  );

  it("rejects an ancestor symlink pointing outside the target", () => {
    const outside = join(sandbox, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(root, ".codex"), "dir");
    expect(() => assertManagedPaths(root, [".codex/agents/coding.toml"])).toThrow(/symbolic link/);
  });

  it("also rejects an ancestor symlink pointing inside the target", () => {
    const internal = join(root, "internal");
    mkdirSync(internal);
    symlinkSync(internal, join(root, ".codex"), "dir");
    expect(() => assertManagedPaths(root, [".codex/agents/coding.toml"])).toThrow(/symbolic link/);
  });

  it.each(["AGENTS.md", ".harness-manifest.json"])("rejects leaf symlink %s", (path) => {
    const outside = join(sandbox, "outside.txt");
    writeFileSync(outside, "user data");
    symlinkSync(outside, join(root, path));
    expect(() => assertManagedPaths(root, [path])).toThrow(/symbolic link/);
  });

  it("rejects dangling symlinks rather than treating them as missing files", () => {
    symlinkSync(join(sandbox, "missing.txt"), join(root, "AGENTS.md"));
    expect(() => assertManagedPaths(root, ["AGENTS.md"])).toThrow(/symbolic link/);
  });

  it("canonicalizes a target selected through a symlink", () => {
    const alias = join(sandbox, "project-alias");
    symlinkSync(root, alias, "dir");
    writeFileSync(join(root, "AGENTS.md"), "managed");
    expect(() => assertManagedPaths(alias, ["AGENTS.md", ".codex/hooks.json"])).not.toThrow();
  });

  it("rejects an existing directory where a generated file belongs", () => {
    mkdirSync(join(root, "AGENTS.md"));
    expect(() => assertManagedPaths(root, ["AGENTS.md"])).toThrow(/unexpected file type/);
  });

  it("rejects an existing file where a parent directory belongs", () => {
    writeFileSync(join(root, ".codex"), "user file");
    expect(() => assertManagedPaths(root, [".codex/agents/coding.toml"])).toThrow(
      /unexpected file type/,
    );
  });
});
