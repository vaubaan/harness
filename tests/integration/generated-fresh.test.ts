import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME } from "../../src/cli/manifest.js";
import { generatedFresh } from "../../src/linters/generated-fresh.js";
import { runLinters } from "../../src/linters/index.js";

// Scenarios from docs/decisions/generated-files-committed.md: generated files
// are committed, and the linter is what keeps them equal to the render.

const PACKAGE_DIR = resolve(__dirname, "../../src");
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-generated-fresh-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function install() {
  return initCommand({ targetDir: root, engines: ["claude-code"], packageDir: PACKAGE_DIR });
}

describe("lint:generated-fresh", () => {
  it("reports nothing on a project without a manifest", () => {
    expect(generatedFresh.run(root)).toEqual([]);
  });

  it("passes right after init, and runs as part of the full lint", () => {
    install();
    expect(generatedFresh.run(root)).toEqual([]);
    const report = runLinters(root, { only: ["lint:generated-fresh"] });
    expect(report.summary.pass).toBe(true);
  });

  it("flags a generated file edited by hand", () => {
    install();
    const skill = ".claude/skills/doc-audit/SKILL.md";
    write(skill, `${readFileSync(join(root, skill), "utf8")}\nlocal edit\n`);
    const issues = generatedFresh.run(root);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", file: skill });
    expect(issues[0]?.message).toMatch(/differs from the current render/);
    expect(issues[0]?.message).toMatch(/update \./);
  });

  it("flags a generated file that was deleted", () => {
    install();
    unlinkSync(join(root, "CLAUDE.md"));
    const issues = generatedFresh.run(root);
    expect(issues.map((issue) => issue.file)).toEqual(["CLAUDE.md"]);
    expect(issues[0]?.message).toMatch(/is missing/);
  });

  it("flags a stale file the manifest lists but the render no longer produces", () => {
    install();
    const manifest = JSON.parse(readFileSync(join(root, MANIFEST_FILENAME), "utf8"));
    manifest.files.push(".claude/agents/coding.md");
    write(".claude/agents/coding.md", "# old persona\n");
    write(MANIFEST_FILENAME, JSON.stringify(manifest));
    const issues = generatedFresh.run(root);
    expect(issues.map((issue) => issue.file)).toEqual([".claude/agents/coding.md"]);
    expect(issues[0]?.message).toMatch(/stale generated file/);
  });

  it("ignores released 1.x files and preserved files", () => {
    write("AGENTS.md", "# ours\n");
    initCommand({
      targetDir: root,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
      preserveFiles: ["AGENTS.md"],
    });
    const manifest = JSON.parse(readFileSync(join(root, MANIFEST_FILENAME), "utf8"));
    manifest.files.push(".mcp.json");
    write(".mcp.json", "{}\n");
    write(MANIFEST_FILENAME, JSON.stringify(manifest));
    expect(generatedFresh.run(root)).toEqual([]);
  });

  it("renders with the project's overrides and skills, like init", () => {
    write(
      ".harness-overrides/skills/team-guide.skill.md",
      "---\nid: team-guide\ndescription: Team guide.\n---\n\nBody.\n",
    );
    write("docs/skills/domain.skill.md", "---\nid: domain\ndescription: Domain.\n---\n\nBody.\n");
    install();
    expect(generatedFresh.run(root)).toEqual([]);
    write("docs/skills/domain.skill.md", "---\nid: domain\ndescription: Domain.\n---\n\nNew.\n");
    const issues = generatedFresh.run(root);
    expect(issues.map((issue) => issue.file)).toEqual([".claude/skills/domain/SKILL.md"]);
  });

  it("reports an invalid manifest instead of crashing", () => {
    write(MANIFEST_FILENAME, "{ not json");
    const issues = generatedFresh.run(root);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/invalid harness manifest/);
  });
});
