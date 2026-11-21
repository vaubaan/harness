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
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCommand } from "../../src/cli/add.js";
import { initCommand } from "../../src/cli/init.js";
import { readManifest } from "../../src/cli/manifest.js";
import { runLinters } from "../../src/linters/index.js";

const PACKAGE_DIR = resolve(__dirname, "..", "..", "src");
const README = "# Project\n\n## What is this\n\nIntro.\n\n## Quick start\n\nInstall.\n";

let root: string;
let backups: string;
let run = 0;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-add-"));
  backups = mkdtempSync(join(tmpdir(), "cah-add-backup-"));
  write("README.md", README);
  write(".gitignore", ".harness-overrides/\n.vaubaan/\n");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(backups, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const init = () =>
  initCommand({ targetDir: root, engines: ["claude-code"], packageDir: PACKAGE_DIR });
const add = (pillar: string) =>
  addCommand({
    targetDir: root,
    pillar,
    packageDir: PACKAGE_DIR,
    backupDir: join(backups, `b${run++}`),
  });
const errors = () => runLinters(root).issues.filter((issue) => issue.severity === "error");

describe("add <pillar>", () => {
  it("activates a pillar: starter file, skill, command and umbrella lines in one command", () => {
    init();
    const result = add("decisions");
    expect(result).toMatchObject({
      pillar: "decisions",
      activated: true,
      filesCreated: ["docs/decisions/README.md"],
    });
    expect(result.next).toMatch(/\/decision/);
    expect(read("docs/decisions/README.md")).toMatch(/^# Decisions/);
    expect(result.update?.filesToWrite).toEqual(
      expect.arrayContaining([
        ".claude/skills/decision-record-writer/SKILL.md",
        ".claude/commands/decision.md",
        "AGENTS.md",
      ]),
    );
    expect(read("AGENTS.md")).toContain("→ an ADR (`/decision`)");
    expect(readManifest(root)?.files).toContain(".claude/skills/decision-record-writer/SKILL.md");
    expect(errors()).toEqual([]);
  });

  it("writes the two test plans with today's date; the lint fails on their placeholders until filled", () => {
    init();
    const result = add("tests");
    expect(result.filesCreated).toEqual([
      "docs/tests/integration-tests.md",
      "docs/tests/e2e-tests.md",
    ]);
    const today = new Date().toISOString().slice(0, 10);
    expect(read("docs/tests/integration-tests.md")).toContain(`last_reviewed: ${today}`);
    expect(existsSync(join(root, ".claude/skills/test-plan-writer/SKILL.md"))).toBe(true);
    expect(errors().map((issue) => issue.linter)).toContain("lint:frontmatter-tracks");
  });

  it("adds intents and profiles with nothing but their generated index, lint green", () => {
    write("docs/spec/system.md", "# System\n");
    init();
    expect(add("intents").filesCreated).toEqual([]);
    expect(read("docs/intents/README.md")).toMatch(/No intent yet/);
    expect(read("AGENTS.md")).toContain("a `proposed` intent first");
    expect(add("profiles").filesCreated).toEqual([]);
    expect(read("docs/profiles/README.md")).toMatch(/No profile yet/);
    expect(existsSync(join(root, ".claude/skills/intent-writer/SKILL.md"))).toBe(true);
    expect(errors()).toEqual([]);
  });

  it("never overwrites an existing file and changes nothing on an active pillar", () => {
    write("docs/workflow/coding-workflow.md", "ours\n");
    init();
    const result = add("workflow");
    expect(result).toMatchObject({ activated: false, filesCreated: [] });
    expect(result.update?.upToDate).toBe(true);
    expect(read("docs/workflow/coding-workflow.md")).toBe("ours\n");
  });

  it("completes a pillar whose folder exists but lacks a starter file", () => {
    write("docs/tests/integration-tests.md", "ours\n");
    init();
    expect(add("tests").filesCreated).toEqual(["docs/tests/e2e-tests.md"]);
    expect(read("docs/tests/integration-tests.md")).toBe("ours\n");
  });

  it("before any installation, only writes the starter files and says to run init", () => {
    const result = add("quality");
    expect(result.filesCreated).toEqual(["docs/quality/code-quality.md"]);
    expect(result.update).toBeUndefined();
    expect(result.next).toMatch(/init \. --engines/);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("refuses an unknown pillar, a core pillar and the skills pillar, writing nothing", () => {
    init();
    expect(() => add("tutorials")).toThrow(
      /unknown pillar: tutorials \(expected one of decisions, handbook, tests, workflow, quality, intents, profiles\)/,
    );
    expect(() => add("spec")).toThrow(/always active/);
    expect(() => add("readme")).toThrow(/always active/);
    expect(() => add("skills")).toThrow(/drop a file into docs\/skills\//);
    expect(existsSync(join(root, "docs"))).toBe(false);
  });

  it("refuses a pillar path that goes through a symbolic link", () => {
    init();
    const outside = mkdtempSync(join(tmpdir(), "cah-add-outside-"));
    try {
      symlinkSync(outside, join(root, "docs"));
      expect(() => add("handbook")).toThrow(/symbolic link in pillar path/);
      expect(existsSync(join(outside, "handbook"))).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
