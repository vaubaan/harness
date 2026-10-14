import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadHarness, loadOverrides, loadProjectSkills } from "./loader.js";
import { render } from "./render.js";
import { AGENT_IDS, ENGINES, ENGINE_ROOT_DIR } from "./types.js";

const PACKAGE_DIR = __dirname;

describe("loadHarness on the stock harness in repo root", () => {
  const harness = loadHarness(PACKAGE_DIR);

  it("loads 4 agents (one per AgentId)", () => {
    const ids = new Set(harness.agents.map((a) => a.meta.id));
    expect(ids.size).toBe(4);
    for (const id of AGENT_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("loads 9 skills (8 doc + clean-code-guardian)", () => {
    expect(harness.skills.length).toBe(9);
  });

  it("loads 9 commands", () => {
    expect(harness.cmds.length).toBe(9);
  });

  it("every command's invokes_skill points to a real skill", () => {
    const skillIds = new Set(harness.skills.map((s) => s.meta.id));
    for (const cmd of harness.cmds) {
      expect(skillIds.has(cmd.meta.invokes_skill)).toBe(true);
    }
  });

  it("renders successfully for every engine in isolation", () => {
    for (const engine of ENGINES) {
      const out = render({ harness, engines: [engine] });
      expect(out.files.length).toBeGreaterThan(0);
      const hasAgents = out.files.some((f) => f.path === "AGENTS.md");
      expect(hasAgents).toBe(true);
    }
  });

  it("renders all engines together (default = all 3) with one persona file per agent per engine", () => {
    const out = render({ harness, engines: [...ENGINES] });
    for (const engine of ENGINES) {
      const personaFiles = out.files.filter((f) =>
        f.path.startsWith(`${ENGINE_ROOT_DIR[engine]}/agents/`),
      );
      expect(personaFiles.length).toBe(AGENT_IDS.length);
    }
  });

  it("deploys all skills on claude-code", () => {
    const out = render({ harness, engines: ["claude-code"] });
    const skillCount = out.files.filter((f) => f.path.includes("/skills/")).length;
    expect(skillCount).toBe(harness.skills.length);
  });
});

describe("loadProjectSkills", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cah-project-skills-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns [] when docs/skills/ does not exist", () => {
    expect(loadProjectSkills(tempDir)).toEqual([]);
  });

  it("returns [] when docs/skills/ exists but has no *.skill.md files", () => {
    mkdirSync(join(tempDir, "docs", "skills"), { recursive: true });
    expect(loadProjectSkills(tempDir)).toEqual([]);
  });

  it("loads valid *.skill.md files and validates frontmatter", () => {
    const skillsDir = join(tempDir, "docs", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "new-plugin-guide.skill.md"),
      `---
id: new-plugin-guide
description: How to implement a new plugin.
tags: [onboarding]
---

# New plugin guide

Step-by-step instructions for creating a new plugin.
`,
    );
    const skills = loadProjectSkills(tempDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.meta.id).toBe("new-plugin-guide");
    expect(skills[0]?.meta.description).toBe("How to implement a new plugin.");
    expect(skills[0]?.meta.tags).toEqual(["onboarding"]);
    expect(skills[0]?.body).toContain("Step-by-step instructions");
  });

  it("loads multiple project skills", () => {
    const skillsDir = join(tempDir, "docs", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "skill-a.skill.md"),
      "---\nid: skill-a\ndescription: Skill A.\n---\nbody a",
    );
    writeFileSync(
      join(skillsDir, "skill-b.skill.md"),
      "---\nid: skill-b\ndescription: Skill B.\n---\nbody b",
    );
    const skills = loadProjectSkills(tempDir);
    expect(skills).toHaveLength(2);
    const ids = skills.map((s) => s.meta.id).sort();
    expect(ids).toEqual(["skill-a", "skill-b"]);
  });
});

describe("loadOverrides", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cah-overrides-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns undefined when .harness-overrides/ directory does not exist", () => {
    const result = loadOverrides(tempDir);
    expect(result).toBeUndefined();
  });

  it("returns empty overrides when .harness-overrides/ exists but has no content", () => {
    mkdirSync(join(tempDir, ".harness-overrides"));
    const result = loadOverrides(tempDir);
    expect(result).toEqual({ add: { agents: [], skills: [], cmds: [] }, disable: [] });
  });

  it("loads disable list from disable.yaml", () => {
    const overridesDir = join(tempDir, ".harness-overrides");
    mkdirSync(overridesDir);
    writeFileSync(join(overridesDir, "disable.yaml"), "disable:\n  - my-skill\n  - my-cmd\n");
    const result = loadOverrides(tempDir);
    expect(result?.disable).toEqual(["my-skill", "my-cmd"]);
  });

  it("ignores corrupt disable.yaml and returns empty disable list", () => {
    const overridesDir = join(tempDir, ".harness-overrides");
    mkdirSync(overridesDir);
    writeFileSync(join(overridesDir, "disable.yaml"), "not: valid: yaml: {{{");
    const result = loadOverrides(tempDir);
    expect(result?.disable).toEqual([]);
  });
});
