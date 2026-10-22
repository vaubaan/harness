import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, readManifest } from "../../src/cli/manifest.js";
import { updateCommand } from "../../src/cli/update.js";
import { VERSION } from "../../src/version.js";

const packageDir = resolve(__dirname, "../../src");
let sandbox: string;
let root: string;
let backup: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "harness-update-integration-"));
  root = join(sandbox, "project");
  backup = join(sandbox, "backup");
  mkdirSync(root);
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function legacy(version = "2", extra: Record<string, unknown> = {}): void {
  write("AGENTS.md", "old generated umbrella\n");
  write(".codex/skills/doc-audit.md", "old generated skill\n");
  write(
    MANIFEST_FILENAME,
    JSON.stringify({
      version,
      ...(version === "1" ? { engine: "codex-cli", agent: "coding" } : { engines: ["codex-cli"] }),
      renderedAt: "2026-05-01T00:00:00Z",
      files: ["AGENTS.md", ".codex/skills/doc-audit.md"],
      ...extra,
    }),
  );
}

function update(extra = {}) {
  return updateCommand({ targetDir: root, packageDir, backupDir: backup, ...extra });
}

describe("project update", () => {
  it.each(["1", "2", "3", "4", "5"])(
    "migrates manifest v%s to native layouts without adding engines or hooks",
    (version) => {
      legacy(version);
      const before = readFileSync(join(root, MANIFEST_FILENAME));
      const result = update();
      expect(result.fromManifestVersion).toBe(version);
      expect(result.backupDir).toBe(backup);
      expect(existsSync(join(root, ".codex/skills/doc-audit.md"))).toBe(false);
      expect(readFileSync(join(root, ".codex/agents/coding.toml"), "utf8")).toContain(
        'name = "coding"',
      );
      expect(existsSync(join(root, ".agents/skills/doc-audit/SKILL.md"))).toBe(true);
      const manifest = readManifest(root);
      expect(manifest?.version).toBe("6");
      expect(manifest?.harnessVersion).toBe(VERSION);
      expect(manifest?.engines).toEqual(["codex-cli"]);
      expect(manifest?.stopHookInstalled).toBe(false);
      expect(existsSync(join(root, ".claude"))).toBe(false);
      expect(existsSync(join(root, ".codex/hooks.json"))).toBe(false);
      expect(before.equals(readFileSync(join(root, MANIFEST_FILENAME)))).toBe(false);
    },
  );

  it("previews without any writes or backup, then is idempotent after application", () => {
    legacy();
    const before = readFileSync(join(root, MANIFEST_FILENAME));
    const preview = update({ dryRun: true });
    expect(preview.filesToWrite).toContain(".codex/agents/coding.toml");
    expect(preview.backupDir).toBeUndefined();
    expect(existsSync(backup)).toBe(false);
    expect(readFileSync(join(root, MANIFEST_FILENAME))).toEqual(before);
    expect(readdirSync(join(root, ".codex"))).toEqual(["skills"]);
    update();
    const once = readFileSync(join(root, MANIFEST_FILENAME));
    const again = update();
    expect(again.upToDate).toBe(true);
    expect(again.backupDir).toBeUndefined();
    expect(readFileSync(join(root, MANIFEST_FILENAME))).toEqual(once);
  });

  it("leaves the project's own configuration files byte-identical when hooks are disabled", () => {
    legacy("4", { stopHookInstalled: false });
    const files = {
      ".codex/config.toml": '# private settings\nmodel = "my-model"\n',
      ".mcp.json": '{"mcpServers":{"private":{"url":"http://localhost:9999"}}}\n',
      ".claude/settings.json": '{ "permissions": { "allow": ["Read"] } }\n',
      ".codex/hooks.json": '{ "hooks": { "SessionStart": [] } }\n',
    };
    for (const [path, content] of Object.entries(files)) write(path, content);
    update();
    for (const [path, content] of Object.entries(files)) {
      expect(readFileSync(join(root, path), "utf8")).toBe(content);
      expect(readManifest(root)?.files).not.toContain(path);
    }
  });

  it("retains a partial hook selection", () => {
    legacy("4", {
      engines: ["claude-code", "codex-cli", "opencode"],
      stopHookInstalled: true,
      stopHookEngines: ["claude-code"],
    });
    update();
    expect(readManifest(root)?.stopHookEngines).toEqual(["claude-code"]);
    expect(existsSync(join(root, ".claude/settings.json"))).toBe(true);
    expect(existsSync(join(root, ".codex/hooks.json"))).toBe(false);
    expect(existsSync(join(root, ".opencode/plugins/harness-stop-hook.ts"))).toBe(false);
  });

  it("rejects collisions outside the manifest before backup or mutation", () => {
    legacy();
    write(".codex/agents/coding.toml", 'name = "my-custom-agent"\n');
    expect(() => update()).toThrow("outside harness manifest");
    expect(existsSync(backup)).toBe(false);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("old generated umbrella\n");
  });

  it("protects local edits using fingerprints recorded by init", () => {
    initCommand({ targetDir: root, packageDir, engines: ["codex-cli"], withStopHook: false });
    write(".codex/agents/coding.toml", "customized instructions\n");
    expect(() => update()).toThrow("modified harness file: .codex/agents/coding.toml");
    expect(existsSync(backup)).toBe(false);
    expect(readFileSync(join(root, ".codex/agents/coding.toml"), "utf8")).toBe(
      "customized instructions\n",
    );
  });

  it("persists explicit preservation across subsequent updates", () => {
    legacy();
    write("AGENTS.md", "project-specific instructions\n");
    update({ preserveFiles: ["AGENTS.md"] });
    expect(readManifest(root)?.files).not.toContain("AGENTS.md");
    expect(readManifest(root)?.preservedFiles).toEqual(["AGENTS.md"]);
    expect(update().upToDate).toBe(true);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("project-specific instructions\n");
  });

  it("automatically loads local overrides and refuses their silent disappearance", () => {
    legacy();
    write(".harness-overrides/disable.yaml", "disable:\n  - doc-audit\n");
    update();
    expect(existsSync(join(root, ".agents/skills/doc-audit/SKILL.md"))).toBe(false);
    expect(readManifest(root)?.overridesDir).toBe(".");
    rmSync(join(root, ".harness-overrides"), { recursive: true });
    expect(() => update({ dryRun: true })).toThrow("overrides are missing");
  });

  it("uses local overrides from a relocated project", () => {
    legacy();
    write(".harness-overrides/disable.yaml", "disable:\n  - doc-audit\n");
    update();
    const moved = join(sandbox, "moved");
    cpSync(root, moved, { recursive: true });
    writeFileSync(
      join(moved, ".harness-overrides/disable.yaml"),
      "disable:\n  - handbook-writer\n",
    );
    const preview = updateCommand({ targetDir: moved, packageDir, dryRun: true });
    expect(preview.filesToWrite).toContain(".agents/skills/doc-audit/SKILL.md");
    expect(preview.filesToRemove).toContain(".agents/skills/handbook-writer/SKILL.md");
  });

  it("requires installation metadata and refuses an unknown schema", () => {
    expect(() => update()).toThrow("no harness manifest");
    legacy("999");
    expect(() => update()).toThrow();
    expect(existsSync(backup)).toBe(false);
  });

  it.each(["disable: [broken", "disable: all"])(
    "refuses invalid override selection before backup: %s",
    (selection) => {
      legacy();
      write(".harness-overrides/disable.yaml", selection);
      expect(() => update()).toThrow("invalid override selection");
      expect(existsSync(backup)).toBe(false);
    },
  );

  it("remembers an explicit external override source and preserves project skills", () => {
    legacy();
    const external = join(sandbox, "external");
    mkdirSync(join(external, ".harness-overrides"), { recursive: true });
    writeFileSync(join(external, ".harness-overrides/disable.yaml"), "disable:\n  - doc-audit\n");
    write(
      "docs/skills/project-guide.skill.md",
      "---\nid: project-guide\ndescription: Project guide.\n---\nProject-specific instructions.\n",
    );
    update({ overridesDir: external });
    expect(readManifest(root)?.overridesDir).toBe(external);
    expect(existsSync(join(root, ".agents/skills/doc-audit/SKILL.md"))).toBe(false);
    expect(readFileSync(join(root, ".agents/skills/project-guide/SKILL.md"), "utf8")).toContain(
      "Project-specific instructions.",
    );
    expect(update().upToDate).toBe(true);
  });

  it("validates all old paths before removing any old file", () => {
    legacy("2", { files: ["AGENTS.md", "../outside"] });
    expect(() => update()).toThrow("unsafe harness path");
    expect(existsSync(backup)).toBe(false);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  });

  it("refuses symbolic destinations even when they target another directory in the project", () => {
    legacy();
    mkdirSync(join(root, ".agents/skills"), { recursive: true });
    mkdirSync(join(root, "custom-skill"));
    symlinkSync("../../custom-skill", join(root, ".agents/skills/doc-audit"));
    expect(() => update()).toThrow("symbolic link");
    expect(existsSync(backup)).toBe(false);
  });
});
