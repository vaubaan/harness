import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCommand } from "../../src/cli/check.js";
import { initCommand } from "../../src/cli/init.js";
import { renderCommand } from "../../src/cli/render.js";
import { updateCommand } from "../../src/cli/update.js";
import { runLinters } from "../../src/linters/index.js";
import { loadHarness } from "../../src/loader.js";
import { ADDABLE_PILLARS, PILLAR_IDS, activePillars } from "../../src/pillars.js";

const PACKAGE_DIR = resolve(__dirname, "..", "..", "src");
const README = "# Project\n\n## What is this\n\nIntro.\n\n## Quick start\n\nInstall.\n";
const ALWAYS = [
  "harn-canvas-review",
  "harn-doc-audit",
  "harn-guide",
  "harn-lesson-miner",
  "harn-readme-writer",
  "harn-spec-writer",
  "harn-upgrade",
];

let root: string;
let backups: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-pillars-"));
  backups = mkdtempSync(join(tmpdir(), "cah-pillars-backup-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(backups, { recursive: true, force: true });
});

function write(rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}
const init = () =>
  initCommand({ targetDir: root, engines: ["claude-code"], packageDir: PACKAGE_DIR });
const update = () =>
  updateCommand({ targetDir: root, packageDir: PACKAGE_DIR, backupDir: join(backups, "b") });
const skillsOf = (files: ReadonlyArray<string>): string[] =>
  files
    .filter((path) => path.startsWith(".claude/skills/"))
    .map((path) => path.split("/")[2] as string)
    .sort();
const agentsMd = () => readFileSync(join(root, "AGENTS.md"), "utf8");

describe("a project that just started: a README alone", () => {
  beforeEach(() => {
    write("README.md", README);
    write(".gitignore", ".harness-overrides/\n.vaubaan/\n");
  });

  it("passes the layout check and the lint, with one warning: no spec yet", () => {
    expect(checkCommand(root)).toEqual({ pass: true, issues: [] });
    init();
    const report = runLinters(root);
    expect(report.summary).toMatchObject({ pass: true, errors: 0 });
    expect(report.issues.map((issue) => issue.linter)).toEqual(["lint:spec-has-content"]);
  });

  it("receives only the always-rendered skills and their commands", () => {
    const result = init();
    expect(skillsOf(result.filesWritten)).toEqual(ALWAYS);
    expect(
      result.filesWritten.filter((path) => path.startsWith(".claude/commands/")).sort(),
    ).toEqual([
      ".claude/commands/harn-canvas.md",
      ".claude/commands/harn-doc-audit.md",
      ".claude/commands/harn-lessons.md",
      ".claude/commands/harn-readme.md",
      ".claude/commands/harn-spec.md",
      ".claude/commands/harn-upgrade.md",
    ]);
  });

  it("gets an AGENTS.md with no line for an inactive pillar, and one line naming them", () => {
    init();
    const umbrella = agentsMd();
    for (const absent of ["docs/handbook", "docs/decisions", "docs/tests", "docs/workflow"]) {
      expect(umbrella).not.toContain(absent);
    }
    expect(umbrella).not.toMatch(/`\/harn-decision`|`\/harn-handbook`|`\/harn-drift`|`\/intent/);
    expect(umbrella).toContain(
      "Not in this project yet: `decisions`, `handbook`, `tests`, `workflow`, `quality`, `intents`, `profiles`.",
    );
    expect(umbrella).toMatch(/npx @vaubaan\/harness add <pillar>.*`harn-guide` skill/);
    expect(umbrella).toContain("- Missing spec for a subsystem you touch");
  });
});

describe("a pillar is active when its folder exists", () => {
  it("core pillars are always active; the others follow their folder", () => {
    expect([...activePillars(root)].sort()).toEqual(["readme", "spec"]);
    write("docs/handbook/pipeline.md", "x");
    write("docs/profiles/README.md", "x");
    expect([...activePillars(root)].sort()).toEqual(["handbook", "profiles", "readme", "spec"]);
  });

  it("creating the folder by hand, then update, brings the pillar's skill, command and rules", () => {
    write("README.md", README);
    init();
    write("docs/decisions/README.md", "# Decisions\n");
    const result = update();
    expect(result.filesToWrite).toEqual(
      expect.arrayContaining([
        ".claude/skills/harn-decision-record-writer/SKILL.md",
        ".claude/commands/harn-decision.md",
        "AGENTS.md",
      ]),
    );
    expect(agentsMd()).toContain("- Implicit structural decision in your changes → an ADR");
    expect(agentsMd()).toContain("- `docs/decisions/<slug>.md`");
    expect(agentsMd()).not.toMatch(/Not in this project yet:.*`decisions`/);
  });

  it("deleting the folder, then update, removes them", () => {
    write("README.md", README);
    write("docs/handbook/README.md", "# Handbook\n");
    init();
    expect(existsSync(join(root, ".claude/skills/harn-handbook-writer/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/skills/harn-drift-detector/SKILL.md"))).toBe(true);
    rmSync(join(root, "docs/handbook"), { recursive: true });
    const result = update();
    expect(result.filesToRemove.sort()).toEqual([
      ".claude/commands/harn-drift.md",
      ".claude/commands/harn-handbook.md",
      ".claude/skills/harn-drift-detector/SKILL.md",
      ".claude/skills/harn-handbook-writer/SKILL.md",
    ]);
    expect(agentsMd()).not.toContain("docs/handbook");
  });

  it("a skill serving several pillars stays while one of them is active", () => {
    write("README.md", README);
    write("docs/handbook/README.md", "# Handbook\n");
    write("docs/workflow/coding-workflow.md", "---\ntracks: [README.md]\n---\n");
    init();
    rmSync(join(root, "docs/handbook"), { recursive: true });
    expect(update().filesToRemove).not.toContain(".claude/skills/harn-drift-detector/SKILL.md");
  });

  it("a mature project with every pillar gets every shipped skill and no 'not yet' line", () => {
    write("README.md", README);
    for (const pillar of ADDABLE_PILLARS) write(`${pillar.dir}/.gitkeep`, "");
    const result = init();
    expect(skillsOf(result.filesWritten)).toEqual(
      loadHarness(PACKAGE_DIR)
        .skills.map((skill) => skill.meta.id)
        .sort(),
    );
    expect(agentsMd()).not.toContain("Not in this project yet");
  });

  it("a project skill may declare the pillars it serves", () => {
    write("README.md", README);
    write(
      "docs/skills/adr-review.skill.md",
      "---\nid: adr-review\ndescription: Reviews ADRs.\npillars: [decisions]\n---\n\nbody\n",
    );
    expect(skillsOf(init().filesWritten)).not.toContain("adr-review");
    write("docs/decisions/README.md", "# Decisions\n");
    expect(update().filesToWrite).toContain(".claude/skills/adr-review/SKILL.md");
  });

  it("the preview render, which reads no project, shows every skill", () => {
    const out = mkdtempSync(join(tmpdir(), "cah-preview-"));
    try {
      const result = renderCommand({
        engines: ["claude-code"],
        outDir: out,
        packageDir: PACKAGE_DIR,
      });
      expect(skillsOf(result.filesWritten)).toHaveLength(loadHarness(PACKAGE_DIR).skills.length);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("every shipped skill names only known pillars, and every addable pillar has a next step", () => {
    for (const skill of loadHarness(PACKAGE_DIR).skills) {
      for (const pillar of skill.meta.pillars ?? []) expect(PILLAR_IDS).toContain(pillar);
    }
    for (const pillar of ADDABLE_PILLARS) expect(pillar.next, pillar.id).toBeTruthy();
  });
});
