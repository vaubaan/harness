import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, hashContent, readManifest } from "../../src/cli/manifest.js";
import { uninstallCommand } from "../../src/cli/uninstall.js";
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
      expect(existsSync(join(root, ".agents/skills/doc-audit/SKILL.md"))).toBe(true);
      expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toMatch(/^# How we work/);
      const manifest = readManifest(root);
      expect(manifest?.version).toBe("6");
      expect(manifest?.harnessVersion).toBe(VERSION);
      expect(manifest?.engines).toEqual(["codex-cli"]);
      expect(existsSync(join(root, ".claude"))).toBe(false);
      expect(existsSync(join(root, ".codex/hooks.json"))).toBe(false);
      expect(existsSync(join(root, ".codex/agents"))).toBe(false);
      expect(before.equals(readFileSync(join(root, MANIFEST_FILENAME)))).toBe(false);
    },
  );

  it("previews without any writes or backup, then is idempotent after application", () => {
    legacy();
    const before = readFileSync(join(root, MANIFEST_FILENAME));
    const preview = update({ dryRun: true });
    expect(preview.filesToWrite).toContain(".agents/skills/doc-audit/SKILL.md");
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

  it("leaves the project's own configuration files byte-identical", () => {
    legacy("4");
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

  it("drops the 1.x hook preference and plugin, and asks to remove a merged hook entry", () => {
    legacy("4", {
      engines: ["claude-code", "codex-cli", "opencode"],
      stopHookInstalled: true,
      stopHookEngines: ["claude-code"],
      files: ["AGENTS.md", ".opencode/plugins/harness-stop-hook.ts"],
    });
    write(".opencode/plugins/harness-stop-hook.ts", "export default {};\n");
    const settings =
      '{"hooks":{"Stop":[{"hooks":[{"command":"npx -y @vaubaan/harness stop-hook --engine claude"}]}]}}\n';
    write(".claude/settings.json", settings);
    const result = update();
    expect(existsSync(join(root, ".opencode/plugins/harness-stop-hook.ts"))).toBe(false);
    expect(readFileSync(join(root, ".claude/settings.json"), "utf8")).toBe(settings);
    expect(result.warnings.join("\n")).toMatch(
      /remove the harness Stop hook entry from \.claude\/settings\.json/,
    );
    const manifest = readManifest(root) as Record<string, unknown> | null;
    expect(manifest?.stopHookEngines).toBeUndefined();
    expect(manifest?.stopHookInstalled).toBeUndefined();
    expect(existsSync(join(root, ".codex/hooks.json"))).toBe(false);
  });

  it("rejects collisions outside the manifest before backup or mutation", () => {
    legacy();
    write(".agents/skills/doc-audit/SKILL.md", "# my custom skill\n");
    expect(() => update()).toThrow("outside harness manifest");
    expect(existsSync(backup)).toBe(false);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("old generated umbrella\n");
  });

  it("protects local edits using fingerprints recorded by init", () => {
    initCommand({ targetDir: root, packageDir, engines: ["codex-cli"] });
    write(".agents/skills/doc-audit/SKILL.md", "customized instructions\n");
    expect(() => update()).toThrow("modified harness file: .agents/skills/doc-audit/SKILL.md");
    expect(existsSync(backup)).toBe(false);
    expect(readFileSync(join(root, ".agents/skills/doc-audit/SKILL.md"), "utf8")).toBe(
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

describe("the intents index across init, update and uninstall", () => {
  const INDEX = "docs/intents/README.md";
  const intentFile = (leafStatus: string) => `---
title: Ship a thing
status: implemented
actors: [maintainer]
spec: ../spec/system.md
last_reviewed: 2026-11-09
---

# Ship a thing

As a maintainer, I ship.

## Build it

status: ${leafStatus}
anchors: src/build.ts
`;
  const index = (leafStatus: string) => `# Intents

User intents of this project, anchored to the code. Generated by \`@vaubaan/harness\` from \`docs/intents/*.md\`: edit the intents, not this file, then run \`npx @vaubaan/harness update .\`.

- [Ship a thing](./ship.md) — implemented · maintainer
  - Build it — ${leafStatus}
`;
  const install = () => initCommand({ targetDir: root, packageDir, engines: ["codex-cli"] });
  let backups = 0;
  const nextUpdate = (extra = {}) =>
    updateCommand({
      targetDir: root,
      packageDir,
      backupDir: join(sandbox, `b${++backups}`),
      ...extra,
    });

  it("init renders the index, records it and lists the pillar in AGENTS.md", () => {
    write("docs/intents/ship.md", intentFile("implemented"));
    install();
    expect(readFileSync(join(root, INDEX), "utf8")).toBe(index("implemented"));
    expect(readManifest(root)?.files).toContain(INDEX);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
      "- `docs/intents/<intent>.md` — user intents, one tree per level-1 intent, anchored to the code. `docs/intents/README.md` is the generated index.",
    );
  });

  it("renders no index and no map line without an intent file", () => {
    install();
    expect(existsSync(join(root, INDEX))).toBe(false);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).not.toMatch(
      /docs\/intents\/<intent>\.md|`\/intent <verb \+ object>`/,
    );
  });

  it("update rewrites the index after an intent file edit, then removes it with the last intent file", () => {
    write("docs/intents/ship.md", intentFile("implemented"));
    install();
    write("docs/intents/ship.md", intentFile("deprecated"));
    expect(nextUpdate().filesToWrite).toContain(INDEX);
    expect(readFileSync(join(root, INDEX), "utf8")).toBe(index("deprecated"));
    rmSync(join(root, "docs/intents/ship.md"));
    const result = nextUpdate();
    expect(result.filesToRemove).toEqual([INDEX]);
    expect(existsSync(join(root, "docs/intents"))).toBe(false);
    expect(readManifest(root)?.files).not.toContain(INDEX);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).not.toMatch(
      /docs\/intents\/<intent>\.md|`\/intent <verb \+ object>`/,
    );
  });

  it("an intent file that does not parse fails init and update before any write", () => {
    write("docs/intents/ship.md", intentFile("shipped"));
    expect(() => install()).toThrow(/docs\/intents\/ship\.md:\d+: invalid status `shipped`/);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    write("docs/intents/ship.md", intentFile("implemented"));
    install();
    write("docs/intents/ship.md", intentFile("shipped"));
    expect(() => nextUpdate()).toThrow(/invalid intents/);
  });

  it("never overwrites a hand-written index, and keeps it with --preserve", () => {
    write("docs/intents/ship.md", intentFile("implemented"));
    write(INDEX, "# Our own index\n");
    expect(() => install()).toThrow(`existing file outside harness manifest: ${INDEX}`);
    initCommand({ targetDir: root, packageDir, engines: ["codex-cli"], preserveFiles: [INDEX] });
    expect(readFileSync(join(root, INDEX), "utf8")).toBe("# Our own index\n");
    expect(readManifest(root)?.preservedFiles).toEqual([INDEX]);
    write("docs/intents/ship.md", intentFile("deprecated"));
    nextUpdate();
    expect(readFileSync(join(root, INDEX), "utf8")).toBe("# Our own index\n");
  });

  it("uninstall removes the index and leaves the intent files", () => {
    write("docs/intents/ship.md", intentFile("implemented"));
    install();
    const result = uninstallCommand({ targetDir: root });
    expect(result.filesRemoved).toContain(INDEX);
    expect(existsSync(join(root, INDEX))).toBe(false);
    expect(readFileSync(join(root, "docs/intents/ship.md"), "utf8")).toBe(
      intentFile("implemented"),
    );
  });

  describe("migration from the 2.2 journeys pillar", () => {
    const OLD_DIR = "docs/journeys";
    const OLD_INDEX = `${OLD_DIR}/README.md`;
    const OLD_INDEX_CONTENT =
      "# Journeys\n\n- [Ship a thing](./ship.md) — implemented · maintainer\n";
    const MOVE_WARNING =
      /docs\/journeys\/ is now docs\/intents\/: run `git mv docs\/journeys docs\/intents`/;

    /** A 2.2 install: the pillar and its generated index under docs/journeys/, recorded in the manifest. */
    function install22(): void {
      write("docs/intents/ship.md", intentFile("implemented"));
      install();
      renameSync(join(root, "docs/intents"), join(root, OLD_DIR));
      write(OLD_INDEX, OLD_INDEX_CONTENT);
      const manifest = JSON.parse(readFileSync(join(root, MANIFEST_FILENAME), "utf8"));
      manifest.files = manifest.files.map((f: string) => (f === INDEX ? OLD_INDEX : f));
      delete manifest.fileHashes[INDEX];
      manifest.fileHashes[OLD_INDEX] = hashContent(OLD_INDEX_CONTENT);
      write(MANIFEST_FILENAME, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    it("after `git mv docs/journeys docs/intents`, update rewrites the moved index and its manifest entry", () => {
      install22();
      renameSync(join(root, OLD_DIR), join(root, "docs/intents"));
      const result = nextUpdate();
      expect(result.filesToWrite).toContain(INDEX);
      expect(result.filesToRemove).toEqual([]);
      expect(result.warnings.join("\n")).not.toMatch(MOVE_WARNING);
      expect(readFileSync(join(root, INDEX), "utf8")).toBe(index("implemented"));
      const manifest = readManifest(root);
      expect(manifest?.files).toContain(INDEX);
      expect(manifest?.files).not.toContain(OLD_INDEX);
      expect(Object.keys(manifest?.fileHashes ?? {})).not.toContain(OLD_INDEX);
      expect(nextUpdate().upToDate).toBe(true);
    });

    it("before the move, update removes the old index, keeps the intent files and warns to git mv", () => {
      install22();
      const result = nextUpdate();
      expect(result.filesToRemove).toEqual([OLD_INDEX]);
      expect(result.warnings.join("\n")).toMatch(MOVE_WARNING);
      expect(existsSync(join(root, OLD_INDEX))).toBe(false);
      expect(readFileSync(join(root, `${OLD_DIR}/ship.md`), "utf8")).toBe(
        intentFile("implemented"),
      );
      expect(readManifest(root)?.files).not.toContain(OLD_INDEX);
      renameSync(join(root, OLD_DIR), join(root, "docs/intents"));
      expect(nextUpdate().filesToWrite).toContain(INDEX);
      expect(readFileSync(join(root, INDEX), "utf8")).toBe(index("implemented"));
    });
  });
});
