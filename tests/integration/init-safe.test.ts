import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type InitArgs, initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, readManifest } from "../../src/cli/manifest.js";
import { uninstallCommand } from "../../src/cli/uninstall.js";
import { updateCommand } from "../../src/cli/update.js";

// Scenarios from docs/decisions/safe-init.md: init never overwrites or
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

  it("merges the Stop hook into an existing .claude/settings.json and restores it on uninstall", () => {
    const original = `${JSON.stringify(userSettings, null, 2)}\n`;
    write(".claude/settings.json", original);
    const result = init({ engines: ["claude-code"] });
    const merged = JSON.parse(read(".claude/settings.json"));
    expect(merged.permissions).toEqual(userSettings.permissions);
    expect(merged.hooks.PreToolUse).toEqual(userSettings.hooks.PreToolUse);
    expect(JSON.stringify(merged.hooks.Stop)).toContain("@vaubaan/harness stop-hook");
    expect(result.backupDir).toBeDefined();
    expect(readManifest(root)?.files).not.toContain(".claude/settings.json");

    uninstallCommand({ targetDir: root });
    expect(JSON.parse(read(".claude/settings.json"))).toEqual(userSettings);
  });

  it("adds an MCP server to an existing .mcp.json and removes only that entry on uninstall", () => {
    const mine = { mcpServers: { mine: { command: "node", args: ["srv.js"] } } };
    write(".mcp.json", JSON.stringify(mine));
    init({ engines: ["claude-code"], mcpServers: ["context7"] });
    const merged = JSON.parse(read(".mcp.json"));
    expect(Object.keys(merged.mcpServers).sort()).toEqual(["context7", "mine"]);
    expect(Object.keys(readManifest(root)?.mcpConfig?.entries ?? {})).toEqual(["context7"]);

    uninstallCommand({ targetDir: root });
    expect(JSON.parse(read(".mcp.json"))).toEqual(mine);
  });

  it("leaves a user .codex/config.toml untouched and prints the block to add", () => {
    const toml = 'model = "o3"\napproval_policy = "never"\n';
    write(".codex/config.toml", toml);
    const result = init({ engines: ["codex-cli"], mcpServers: ["context7"] });
    expect(read(".codex/config.toml")).toBe(toml);
    expect(result.warnings.join("\n")).toMatch(
      /left \.codex\/config\.toml unchanged[\s\S]*\[mcp_servers\.context7\]/,
    );
    expect(readManifest(root)?.files).not.toContain(".codex/config.toml");

    uninstallCommand({ targetDir: root });
    expect(read(".codex/config.toml")).toBe(toml);
  });

  it("writes and later removes a .codex/config.toml it created", () => {
    init({ engines: ["codex-cli"], mcpServers: ["context7"] });
    expect(read(".codex/config.toml")).toContain("[mcp_servers.context7]");
    expect(readManifest(root)?.files).toContain(".codex/config.toml");
    init({ engines: ["codex-cli"] });
    expect(existsSync(join(root, ".codex/config.toml"))).toBe(false);
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

  it("keeps what update preserved: preserved files and user hooks", () => {
    init({ engines: ["claude-code"] });
    write("AGENTS.md", "# edited by the team\n");
    const settings = JSON.parse(read(".claude/settings.json"));
    settings.hooks.PreToolUse = userSettings.hooks.PreToolUse;
    write(".claude/settings.json", JSON.stringify(settings));
    updateCommand({ targetDir: root, preserveFiles: ["AGENTS.md"], backupDir: backupDir() });

    init({ engines: ["claude-code"] });
    expect(read("AGENTS.md")).toBe("# edited by the team\n");
    expect(JSON.parse(read(".claude/settings.json")).hooks.PreToolUse).toEqual(
      userSettings.hooks.PreToolUse,
    );
    expect(readManifest(root)?.preservedFiles).toEqual(["AGENTS.md"]);
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

  it("removes hook files a pre-1.4 init wrote whole, after an update", () => {
    init({ engines: ["claude-code"] });
    // Simulate a manifest written by init before 1.4.0: the hook file is a
    // whole harness file, with no entry-level ownership.
    const manifest = JSON.parse(read(MANIFEST_FILENAME));
    manifest.files.push(".claude/settings.json");
    manifest.hookConfigs = undefined;
    write(MANIFEST_FILENAME, JSON.stringify(manifest));
    updateCommand({ targetDir: root, backupDir: backupDir() });

    uninstallCommand({ targetDir: root });
    expect(existsSync(join(root, ".claude/settings.json"))).toBe(false);
  });
});
