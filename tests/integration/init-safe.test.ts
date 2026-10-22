import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type InitArgs, initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, readManifest } from "../../src/cli/manifest.js";
import { uninstallCommand } from "../../src/cli/uninstall.js";
import { updateCommand } from "../../src/cli/update.js";

// Scenarios from docs/decisions/safe-init.md and
// docs/decisions/no-mcp-no-code-merge.md: init never overwrites, merges or
// deletes what it does not own.

const PACKAGE_DIR = resolve(__dirname, "../../src");
let sandbox: string;
let root: string;
let backups = 0;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cah-init-safe-"));
  root = join(sandbox, "project");
  mkdirSync(root);
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function backupDir(): string {
  backups += 1;
  return join(sandbox, `backup-${backups}`);
}

function init(args: Partial<InitArgs> = {}) {
  return initCommand({ targetDir: root, packageDir: PACKAGE_DIR, backupDir: backupDir(), ...args });
}

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const SETTINGS = ".claude/settings.json";
const STOP_HOOK = "npx -y @vaubaan/harness stop-hook --engine claude";
const userSettings = {
  permissions: { allow: ["Bash(npm test)"] },
  hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo user" }] }] },
};

describe("init on an existing project", () => {
  it("refuses hand-written generated files, lists them all, and writes nothing", () => {
    write("AGENTS.md", "# my rules\n");
    write("CLAUDE.md", "# my claude rules\n");
    expect(() => init({ engines: ["claude-code"] })).toThrow(
      /existing file outside harness manifest: AGENTS\.md\nexisting file outside harness manifest: CLAUDE\.md\n.*--preserve/,
    );
    expect(read("AGENTS.md")).toBe("# my rules\n");
    expect(existsSync(join(root, MANIFEST_FILENAME))).toBe(false);
    expect(existsSync(join(root, ".claude"))).toBe(false);
  });

  it("keeps a preserved file as the project's own and records the choice", () => {
    write("AGENTS.md", "# my rules\n");
    const result = init({ engines: ["claude-code"], preserveFiles: ["AGENTS.md"] });
    expect(read("AGENTS.md")).toBe("# my rules\n");
    expect(result.filesWritten).not.toContain("AGENTS.md");
    expect(readManifest(root)?.preservedFiles).toEqual(["AGENTS.md"]);
    uninstallCommand({ targetDir: root });
    expect(read("AGENTS.md")).toBe("# my rules\n");
  });

  it("leaves an existing .claude/settings.json untouched and prints the Stop hook to add", () => {
    const original = `${JSON.stringify(userSettings, null, 2)}\n`;
    write(SETTINGS, original);
    const result = init({ engines: ["claude-code"] });
    expect(read(SETTINGS)).toBe(original);
    expect(result.warnings.join("\n")).toMatch(
      /left \.claude\/settings\.json unchanged; add this Stop hook to it:[\s\S]*stop-hook --engine claude/,
    );
    expect(result.filesWritten).not.toContain(SETTINGS);
    expect(readManifest(root)?.files).not.toContain(SETTINGS);
    // Nothing existing was touched, so the backup holds no copy of the file.
    expect(existsSync(join(result.backupDir ?? "", "files", SETTINGS))).toBe(false);

    uninstallCommand({ targetDir: root });
    expect(read(SETTINGS)).toBe(original);
  });

  it("recognizes a settings file that already runs the Stop hook, as 1.x merged it", () => {
    const merged = {
      ...userSettings,
      hooks: {
        ...userSettings.hooks,
        Stop: [{ hooks: [{ type: "command", command: STOP_HOOK }] }],
      },
    };
    const original = `${JSON.stringify(merged, null, 2)}\n`;
    write(SETTINGS, original);
    const result = init({ engines: ["claude-code"] });
    expect(read(SETTINGS)).toBe(original);
    expect(result.warnings).toContain(
      ".claude/settings.json already runs the harness Stop hook and stays yours",
    );
    expect(result.warnings.join("\n")).not.toMatch(/add this Stop hook/);
    expect(readManifest(root)?.files).not.toContain(SETTINGS);
  });

  it("writes the hook file when absent, re-renders it while unchanged, and releases it once edited", () => {
    init({ engines: ["claude-code"] });
    expect(readManifest(root)?.files).toContain(SETTINGS);
    expect(read(SETTINGS)).toContain(STOP_HOOK);
    const again = init({ engines: ["claude-code"] });
    expect(again.filesWritten).toContain(SETTINGS);
    expect(again.backupDir).toBeUndefined();

    const settings = JSON.parse(read(SETTINGS));
    settings.permissions = userSettings.permissions;
    const edited = `${JSON.stringify(settings, null, 2)}\n`;
    write(SETTINGS, edited);
    const released = init({ engines: ["claude-code"] });
    expect(read(SETTINGS)).toBe(edited);
    expect(released.warnings).toContain(
      ".claude/settings.json already runs the harness Stop hook and stays yours",
    );
    expect(readManifest(root)?.files).not.toContain(SETTINGS);
    uninstallCommand({ targetDir: root });
    expect(read(SETTINGS)).toBe(edited);
  });

  it("accepts --preserve on a hook file", () => {
    const result = init({ engines: ["claude-code"], preserveFiles: [SETTINGS] });
    expect(result.filesWritten).not.toContain(SETTINGS);
    expect(existsSync(join(root, SETTINGS))).toBe(false);
    expect(readManifest(root)?.preservedFiles).toEqual([SETTINGS]);
  });

  it("releases files a 1.x install edited, without touching them", () => {
    init({ engines: ["codex-cli"], withStopHook: false });
    const mcp = '{ "mcpServers": { "mine": { "command": "node" } } }\n';
    const toml = 'model = "o3"\n[mcp_servers.context7]\ncommand = "npx"\n';
    write(".mcp.json", mcp);
    write(".codex/config.toml", toml);
    // A manifest written before 2.0 listed these files, and recorded entry ownership.
    const manifest = JSON.parse(read(MANIFEST_FILENAME));
    manifest.files.push(".mcp.json", ".codex/config.toml");
    manifest.mcpConfig = { createdFile: false, addedMcp: false, addedSchema: false, entries: {} };
    manifest.hookConfigs = {};
    write(MANIFEST_FILENAME, JSON.stringify(manifest));

    const result = init({ engines: ["codex-cli"], withStopHook: false });
    expect(result.warnings).toContain("no longer managed by the harness, left in place: .mcp.json");
    expect(result.warnings).toContain(
      "no longer managed by the harness, left in place: .codex/config.toml",
    );
    expect(read(".mcp.json")).toBe(mcp);
    expect(read(".codex/config.toml")).toBe(toml);
    expect(readManifest(root)?.files).not.toContain(".mcp.json");
    expect(readManifest(root)?.files).not.toContain(".codex/config.toml");

    uninstallCommand({ targetDir: root });
    expect(read(".mcp.json")).toBe(mcp);
    expect(read(".codex/config.toml")).toBe(toml);
  });

  it("loads .harness-overrides/ from the project by default, like update", () => {
    write(
      ".harness-overrides/skills/team-guide.skill.md",
      "---\nid: team-guide\ndescription: Team guide.\n---\n\nBody.\n",
    );
    const result = init({ engines: ["claude-code"] });
    expect(result.filesWritten).toContain(".claude/skills/team-guide/SKILL.md");
    expect(readManifest(root)?.overridesDir).toBe(".");
  });
});

describe("re-running init", () => {
  it("is idempotent and creates no backup when nothing changes", () => {
    init({ engines: ["claude-code"] });
    const manifest = read(MANIFEST_FILENAME);
    const again = init({ engines: ["claude-code"] });
    expect(again.backupDir).toBeUndefined();
    expect(read(MANIFEST_FILENAME)).toBe(manifest);
  });

  it("refuses to overwrite a generated file edited since the last run", () => {
    init({ engines: ["claude-code"] });
    write(".claude/agents/coding.md", "# my coding persona\n");
    expect(() => init({ engines: ["claude-code"] })).toThrow(
      /modified harness file: \.claude\/agents\/coding\.md/,
    );
    expect(read(".claude/agents/coding.md")).toBe("# my coding persona\n");
  });

  it("keeps what update preserved: preserved files and an edited hook file", () => {
    init({ engines: ["claude-code"] });
    write("AGENTS.md", "# edited by the team\n");
    const settings = JSON.parse(read(SETTINGS));
    settings.hooks.PreToolUse = userSettings.hooks.PreToolUse;
    write(SETTINGS, JSON.stringify(settings));
    updateCommand({ targetDir: root, preserveFiles: ["AGENTS.md"], backupDir: backupDir() });

    init({ engines: ["claude-code"] });
    expect(read("AGENTS.md")).toBe("# edited by the team\n");
    expect(JSON.parse(read(SETTINGS)).hooks.PreToolUse).toEqual(userSettings.hooks.PreToolUse);
    expect(readManifest(root)?.preservedFiles).toEqual(["AGENTS.md"]);
  });

  it("removes the hook file it wrote when the Stop hook is disabled, and keeps an edited one", () => {
    init({ engines: ["claude-code"] });
    init({ engines: ["claude-code"], withStopHook: false });
    expect(existsSync(join(root, SETTINGS))).toBe(false);

    init({ engines: ["claude-code"] });
    write(SETTINGS, JSON.stringify(userSettings));
    const result = init({ engines: ["claude-code"], withStopHook: false });
    expect(result.warnings).toContain("kept modified .claude/settings.json; it is yours now");
    expect(JSON.parse(read(SETTINGS))).toEqual(userSettings);
    expect(readManifest(root)?.files).not.toContain(SETTINGS);
  });

  it("deduplicates engines and rejects an empty selection", () => {
    init({ engines: ["claude-code", "claude-code"] });
    expect(readManifest(root)?.engines).toEqual(["claude-code"]);
    expect(() => init({ engines: [] })).toThrow(/no engine selected/);
  });
});

describe("uninstall", () => {
  it("keeps a generated file the user edited, with a warning", () => {
    init({ engines: ["claude-code"] });
    write(".claude/agents/review.md", "# our review rules\n");
    const result = uninstallCommand({ targetDir: root });
    expect(read(".claude/agents/review.md")).toBe("# our review rules\n");
    expect(result.warnings).toContain("kept modified harness file: .claude/agents/review.md");
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("removes a hook file it wrote and keeps one it did not", () => {
    init({ engines: ["claude-code"] });
    uninstallCommand({ targetDir: root });
    expect(existsSync(join(root, SETTINGS))).toBe(false);

    const original = JSON.stringify(userSettings);
    write(SETTINGS, original);
    init({ engines: ["claude-code"] });
    uninstallCommand({ targetDir: root });
    expect(read(SETTINGS)).toBe(original);
  });
});
