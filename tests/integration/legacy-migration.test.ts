import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RELEASED_PATHS } from "../../src/cli/hook-configs.js";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, MANIFEST_VERSION, readManifest } from "../../src/cli/manifest.js";
import { AGENT_IDS, ENGINES } from "../../src/types.js";

const PACKAGE_DIR = resolve(__dirname, "..", "..", "src");
const LEGACY_MANIFEST = readFileSync(
  resolve(__dirname, "..", "fixtures", "legacy-0.9", "manifest.json"),
  "utf8",
);
const legacy = JSON.parse(LEGACY_MANIFEST) as { version: string; files: string[] };

let sandbox: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cah-legacy-migration-"));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("migration from the actual 0.9.0 manifest", () => {
  it("replaces obsolete layouts and releases the files it used to edit", () => {
    expect(legacy.version).toBe("4");
    for (const path of legacy.files) {
      const full = join(sandbox, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, path.endsWith(".json") ? "{}\n" : "# legacy harness content\n");
    }
    writeFileSync(join(sandbox, MANIFEST_FILENAME), LEGACY_MANIFEST);
    const legacyMcp = JSON.stringify({ mcp: { context7: { type: "local", command: ["npx"] } } });
    writeFileSync(join(sandbox, ".opencode/mcp.json"), legacyMcp);
    const userConfig = JSON.stringify({ model: "openai/gpt-4.1", permission: { edit: "deny" } });
    writeFileSync(join(sandbox, ".opencode/opencode.json"), userConfig);
    const userPluginPath = join(sandbox, ".opencode/plugins/personal.ts");
    const userPlugin = "export const Personal = async () => ({});\n";
    writeFileSync(userPluginPath, userPlugin);

    const result = initCommand({ targetDir: sandbox, packageDir: PACKAGE_DIR, engines: ENGINES });

    const released = legacy.files.filter((path) => RELEASED_PATHS.includes(path));
    expect(released).toContain(".opencode/mcp.json");
    const obsolete = legacy.files.filter(
      (path) =>
        !released.includes(path) &&
        (/^\.codex\/agents\/.+\.md$/.test(path) ||
          path.startsWith(".codex/skills/") ||
          path.startsWith(".codex/commands/") ||
          path.startsWith(".opencode/plugins/")),
    );
    expect(result.staleFilesRemoved.sort()).toEqual(obsolete.sort());
    for (const path of obsolete) expect(existsSync(join(sandbox, path)), path).toBe(false);
    expect(existsSync(join(sandbox, ".codex/skills"))).toBe(false);
    expect(existsSync(join(sandbox, ".codex/commands"))).toBe(false);

    for (const id of AGENT_IDS) {
      expect(existsSync(join(sandbox, `.codex/agents/${id}.toml`))).toBe(true);
      expect(existsSync(join(sandbox, `.claude/agents/${id}.md`))).toBe(true);
      expect(existsSync(join(sandbox, `.opencode/agents/${id}.md`))).toBe(true);
    }
    for (const path of legacy.files.filter((file) => file.startsWith(".codex/skills/"))) {
      const id = path.slice(".codex/skills/".length, -".md".length);
      const nativeSkill = `.agents/skills/${id}/SKILL.md`;
      expect(result.filesWritten).toContain(nativeSkill);
      expect(existsSync(join(sandbox, nativeSkill))).toBe(true);
    }
    expect(existsSync(join(sandbox, ".opencode/plugins/harness-stop-hook.ts"))).toBe(true);
    expect(readFileSync(userPluginPath, "utf8")).toBe(userPlugin);

    // Files 1.x edited are left in place, byte for byte, and leave the manifest.
    expect(readFileSync(join(sandbox, ".opencode/mcp.json"), "utf8")).toBe(legacyMcp);
    expect(readFileSync(join(sandbox, ".opencode/opencode.json"), "utf8")).toBe(userConfig);
    for (const path of released) {
      expect(result.warnings).toContain(`no longer managed by the harness, left in place: ${path}`);
    }
    const manifest = readManifest(sandbox);
    expect(manifest?.version).toBe(MANIFEST_VERSION);
    for (const path of RELEASED_PATHS) expect(manifest?.files).not.toContain(path);
  });
});
