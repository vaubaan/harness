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
  return initCommand({
    targetDir: root,
    engines: ["claude-code"],
    packageDir: PACKAGE_DIR,
    backupDir: backupDir(),
    ...args,
  });
}

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const SKILL = ".claude/skills/doc-audit/SKILL.md";
const SETTINGS = ".claude/settings.json";
const STOP_HOOK = "npx -y @vaubaan/harness stop-hook --engine claude";

describe("init on an existing project", () => {
  it("refuses hand-written generated files, lists them all, and writes nothing", () => {
    write("AGENTS.md", "# my rules\n");
    write("CLAUDE.md", "# my claude rules\n");
    expect(() => init()).toThrow(
      /existing file outside harness manifest: AGENTS\.md\nexisting file outside harness manifest: CLAUDE\.md\n.*--preserve/,
    );
    expect(read("AGENTS.md")).toBe("# my rules\n");
    expect(existsSync(join(root, MANIFEST_FILENAME))).toBe(false);
    expect(existsSync(join(root, ".claude"))).toBe(false);
  });

  it("keeps a preserved file as the project's own and records the choice", () => {
    write("AGENTS.md", "# my rules\n");
    const result = init({ preserveFiles: ["AGENTS.md"] });
    expect(read("AGENTS.md")).toBe("# my rules\n");
    expect(result.filesWritten).not.toContain("AGENTS.md");
    expect(readManifest(root)?.preservedFiles).toEqual(["AGENTS.md"]);
    uninstallCommand({ targetDir: root });
    expect(read("AGENTS.md")).toBe("# my rules\n");
  });

  it("never touches engine settings, and asks to remove a Stop hook entry 1.x merged", () => {
    const settings = `{ "permissions": { "allow": ["Bash(npm test)"] }, "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "${STOP_HOOK}" }] }] } }\n`;
    write(SETTINGS, settings);
    const result = init();
    expect(read(SETTINGS)).toBe(settings);
    expect(result.filesWritten).not.toContain(SETTINGS);
    expect(readManifest(root)?.files).not.toContain(SETTINGS);
    expect(result.warnings.join("\n")).toMatch(
      /remove the harness Stop hook entry from \.claude\/settings\.json/,
    );
    // Nothing existing was touched, so the backup holds no copy of the file.
    expect(existsSync(join(result.backupDir ?? "", "files", SETTINGS))).toBe(false);

    uninstallCommand({ targetDir: root });
    expect(read(SETTINGS)).toBe(settings);
  });

  it("releases files a 1.x install wrote or edited, without touching them", () => {
    init({ engines: ["codex-cli"] });
    const mcp = '{ "mcpServers": { "mine": { "command": "node" } } }\n';
    const toml = 'model = "o3"\n[mcp_servers.context7]\ncommand = "npx"\n';
    const hooks = '{ "hooks": { "Stop": [] } }\n';
    write(".mcp.json", mcp);
    write(".codex/config.toml", toml);
    write(".codex/hooks.json", hooks);
    // A manifest written before 2.0 listed these files, and recorded entry ownership.
    const manifest = JSON.parse(read(MANIFEST_FILENAME));
    manifest.files.push(".mcp.json", ".codex/config.toml", ".codex/hooks.json");
    manifest.mcpConfig = { createdFile: false, addedMcp: false, addedSchema: false, entries: {} };
    manifest.hookConfigs = {};
    manifest.stopHookInstalled = true;
    write(MANIFEST_FILENAME, JSON.stringify(manifest));

    const result = init({ engines: ["codex-cli"] });
    for (const path of [".mcp.json", ".codex/config.toml", ".codex/hooks.json"]) {
      expect(result.warnings).toContain(`no longer managed by the harness, left in place: ${path}`);
      expect(readManifest(root)?.files).not.toContain(path);
    }
    expect(read(".mcp.json")).toBe(mcp);
    expect(read(".codex/config.toml")).toBe(toml);
    expect(read(".codex/hooks.json")).toBe(hooks);

    uninstallCommand({ targetDir: root });
    expect(read(".mcp.json")).toBe(mcp);
    expect(read(".codex/config.toml")).toBe(toml);
    expect(read(".codex/hooks.json")).toBe(hooks);
  });

  it("loads .harness-overrides/ from the project by default, like update", () => {
    write(
      ".harness-overrides/skills/team-guide.skill.md",
      "---\nid: team-guide\ndescription: Team guide.\n---\n\nBody.\n",
    );
    const result = init();
    expect(result.filesWritten).toContain(".claude/skills/team-guide/SKILL.md");
    expect(readManifest(root)?.overridesDir).toBe(".");
  });
});

describe("re-running init", () => {
  it("is idempotent and creates no backup when nothing changes", () => {
    init();
    const manifest = read(MANIFEST_FILENAME);
    const again = init();
    expect(again.backupDir).toBeUndefined();
    expect(read(MANIFEST_FILENAME)).toBe(manifest);
  });

  it("refuses to overwrite a generated file edited since the last run", () => {
    init();
    write(SKILL, "# my audit rules\n");
    expect(() => init()).toThrow(/modified harness file: \.claude\/skills\/doc-audit\/SKILL\.md/);
    expect(read(SKILL)).toBe("# my audit rules\n");
  });

  it("keeps what update preserved", () => {
    init();
    write("AGENTS.md", "# edited by the team\n");
    updateCommand({ targetDir: root, preserveFiles: ["AGENTS.md"], backupDir: backupDir() });

    init();
    expect(read("AGENTS.md")).toBe("# edited by the team\n");
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
    init();
    write(SKILL, "# our audit rules\n");
    const result = uninstallCommand({ targetDir: root });
    expect(read(SKILL)).toBe("# our audit rules\n");
    expect(result.warnings).toContain(`kept modified harness file: ${SKILL}`);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });
});
