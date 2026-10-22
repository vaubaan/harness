import { describe, expect, it } from "vitest";
import { parseCmd } from "./parser/cmd.js";
import { parseSkill } from "./parser/skill.js";
import { type Harness, RenderError, applyOverrides, render } from "./render.js";

function mkSkill(id: string, opts: { engines?: string[]; requires?: string[] } = {}) {
  const lines = ["---", `id: ${id}`, `description: ${id} skill.`];
  if (opts.engines) lines.push(`engines: [${opts.engines.join(", ")}]`);
  if (opts.requires) lines.push(`requires: [${opts.requires.join(", ")}]`);
  lines.push("---", "", `body of ${id}`);
  return parseSkill(`${id}.skill.md`, lines.join("\n"));
}

function mkCmd(id: string, invokesSkill: string) {
  return parseCmd(
    `${id}.cmd.md`,
    `---
id: ${id}
trigger: /${id}
invokes_skill: ${invokesSkill}
description: ${id} cmd.
---

cmd body
`,
  );
}

describe("render — multi-engine harness without personas or hooks", () => {
  const harness: Harness = {
    skills: [mkSkill("doc-audit"), mkSkill("decision-record-writer"), mkSkill("handbook-writer")],
    cmds: [
      mkCmd("doc-audit", "doc-audit"),
      mkCmd("decision", "decision-record-writer"),
      mkCmd("handbook", "handbook-writer"),
    ],
  };

  it("claude-code: emits AGENTS.md umbrella + CLAUDE.md + skills + commands under .claude/", () => {
    const out = render({ harness, engines: ["claude-code"] });
    const paths = out.files.map((f) => f.path).sort();
    expect(paths).toEqual([
      ".claude/commands/decision.md",
      ".claude/commands/doc-audit.md",
      ".claude/commands/handbook.md",
      ".claude/skills/decision-record-writer/SKILL.md",
      ".claude/skills/doc-audit/SKILL.md",
      ".claude/skills/handbook-writer/SKILL.md",
      "AGENTS.md",
      "CLAUDE.md",
    ]);
  });

  it("never emits a persona, an engine hook or an MCP file", () => {
    const out = render({ harness, engines: ["claude-code", "codex-cli", "opencode"] });
    const paths = out.files.map((f) => f.path);
    expect(paths.some((p) => p.includes("/agents/"))).toBe(false);
    expect(paths).not.toContain(".claude/settings.json");
    expect(paths).not.toContain(".codex/hooks.json");
    expect(paths.some((p) => p.startsWith(".opencode/plugins/"))).toBe(false);
    expect(paths).not.toContain(".mcp.json");
    expect(paths).not.toContain(".codex/config.toml");
    expect(paths).not.toContain(".opencode/opencode.json");
  });

  it("multi-engine: claude-code + codex-cli emit under each engine folder + 1 umbrella + claude stub", () => {
    const out = render({ harness, engines: ["claude-code", "codex-cli"] });
    const paths = out.files.map((f) => f.path).sort();
    expect(paths).toContain(".claude/skills/doc-audit/SKILL.md");
    expect(paths).toContain(".agents/skills/doc-audit/SKILL.md");
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
    // AGENTS.md is emitted exactly once
    expect(paths.filter((p) => p === "AGENTS.md")).toHaveLength(1);
  });

  it("codex-only install: no CLAUDE.md stub and no command files", () => {
    const out = render({ harness, engines: ["codex-cli"] });
    const paths = out.files.map((f) => f.path);
    expect(paths).not.toContain("CLAUDE.md");
    expect(paths).toContain("AGENTS.md");
    expect(paths.some((p) => p.includes("/commands/"))).toBe(false);
  });

  it("AGENTS.md umbrella carries the work method, the checks and the doc-skills", () => {
    const out = render({ harness, engines: ["claude-code"] });
    const umbrella = out.files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(umbrella).toMatch(/^# How we work/);
    expect(umbrella).toMatch(/## Project map/);
    expect(umbrella).toMatch(/## Doc-first/);
    expect(umbrella).toMatch(/## Checks/);
    expect(umbrella).toMatch(/npx @vaubaan\/harness lint/);
    expect(umbrella).toMatch(/## Doc-skills\n\n- `doc-audit` \(`\/doc-audit`\)/);
    expect(umbrella).toMatch(/decision-record-writer/);
    expect(umbrella).not.toMatch(/persona/i);
    expect(umbrella).not.toMatch(/Stop hook/);
  });

  it("throws RenderError when engines list is empty", () => {
    expect(() => render({ harness, engines: [] })).toThrow(RenderError);
  });

  it("codex-cli renders skills requiring multi-step with degradation warning", () => {
    const h: Harness = {
      skills: [mkSkill("doc-audit", { requires: ["multi-step"] }), mkSkill("simple")],
      cmds: [mkCmd("doc-audit", "doc-audit"), mkCmd("simple", "simple")],
    };
    const out = render({ harness: h, engines: ["codex-cli"] });
    const skillPaths = out.files.filter((f) => f.path.includes("/skills/")).map((f) => f.path);
    expect(skillPaths.sort()).toEqual([
      ".agents/skills/doc-audit/SKILL.md",
      ".agents/skills/simple/SKILL.md",
    ]);
    expect(out.warnings.some((w) => w.includes("multi-step") && w.includes("degradation"))).toBe(
      true,
    );
  });

  it("drops a command whose skill was skipped on that engine", () => {
    const h: Harness = {
      skills: [mkSkill("only-claude", { engines: ["claude-code"] })],
      cmds: [mkCmd("only-claude", "only-claude")],
    };
    const out = render({ harness: h, engines: ["opencode"] });
    const paths = out.files.map((f) => f.path);
    expect(paths).toEqual(["AGENTS.md"]);
    expect(out.warnings.join(" ")).toMatch(/excluded from engine "opencode"/);
  });

  it("opencode drops its own skill copy when another rendered engine already exposes it", () => {
    const out = render({ harness, engines: ["opencode", "claude-code"] });
    const paths = out.files.map((f) => f.path);
    expect(paths).toContain(".claude/skills/doc-audit/SKILL.md");
    expect(paths.some((p) => p.startsWith(".opencode/skills/"))).toBe(false);
    expect(paths).toContain(".opencode/commands/doc-audit.md");
  });

  it("CLAUDE.md is an @AGENTS.md import", () => {
    const out = render({ harness, engines: ["claude-code"] });
    expect(out.files.find((f) => f.path === "CLAUDE.md")?.content).toBe("@AGENTS.md\n");
  });

  it("opencode alone emits its skills and commands under .opencode/", () => {
    const out = render({ harness, engines: ["opencode"] });
    const skillPaths = out.files.filter((f) => f.path.includes("/skills/")).map((f) => f.path);
    expect(skillPaths.sort()).toEqual([
      ".opencode/skills/decision-record-writer/SKILL.md",
      ".opencode/skills/doc-audit/SKILL.md",
      ".opencode/skills/handbook-writer/SKILL.md",
    ]);
    expect(out.files.map((f) => f.path)).toContain(".opencode/commands/decision.md");
  });
});

describe("applyOverrides", () => {
  it("disables a skill by id", () => {
    const h: Harness = {
      skills: [mkSkill("a"), mkSkill("b")],
      cmds: [mkCmd("a", "a"), mkCmd("b", "b")],
    };
    const out = applyOverrides(h, { disable: ["b"] });
    expect(out.skills.map((s) => s.meta.id)).toEqual(["a"]);
    expect(out.cmds.map((c) => c.meta.id)).toEqual(["a"]);
  });

  it("overrides a skill with same id (override wins)", () => {
    const h: Harness = {
      skills: [mkSkill("a", { engines: ["claude-code"] })],
      cmds: [],
    };
    const override = mkSkill("a", { engines: ["opencode"] });
    const out = applyOverrides(h, { add: { skills: [override] } });
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0]?.meta.engines).toEqual(["opencode"]);
  });

  it("adds new skill that doesn't exist in stock", () => {
    const h: Harness = { skills: [], cmds: [] };
    const newSkill = mkSkill("new-one");
    const out = applyOverrides(h, { add: { skills: [newSkill] } });
    expect(out.skills.map((s) => s.meta.id)).toEqual(["new-one"]);
  });
});

describe("render with projectSkills", () => {
  const harness: Harness = {
    skills: [mkSkill("stock-skill")],
    cmds: [],
  };

  it("project skills are rendered alongside stock skills", () => {
    const projectSkill = mkSkill("project-guide");
    const out = render({ harness, engines: ["claude-code"], projectSkills: [projectSkill] });
    const skillPaths = out.files
      .filter((f) => f.path.includes("/skills/"))
      .map((f) => f.path)
      .sort();
    expect(skillPaths).toEqual([
      ".claude/skills/project-guide/SKILL.md",
      ".claude/skills/stock-skill/SKILL.md",
    ]);
  });

  it("project skill with same id as stock replaces stock", () => {
    const projectOverride = mkSkill("stock-skill", { engines: ["opencode"] });
    const out = render({ harness, engines: ["opencode"], projectSkills: [projectOverride] });
    const skillPaths = out.files.filter((f) => f.path.includes("/skills/")).map((f) => f.path);
    expect(skillPaths).toEqual([".opencode/skills/stock-skill/SKILL.md"]);
  });

  it("overrides can disable a project skill", () => {
    const projectSkill = mkSkill("project-guide");
    const out = render({
      harness,
      engines: ["claude-code"],
      projectSkills: [projectSkill],
      overrides: { disable: ["project-guide"] },
    });
    const skillPaths = out.files.filter((f) => f.path.includes("/skills/")).map((f) => f.path);
    expect(skillPaths).toEqual([".claude/skills/stock-skill/SKILL.md"]);
  });

  it("umbrella mentions project skills in 'Project map' when present", () => {
    const out = render({ harness, engines: ["claude-code"], projectSkills: [mkSkill("my-guide")] });
    const umbrella = out.files.find((f) => f.path === "AGENTS.md");
    expect(umbrella?.content).toMatch(/docs\/skills\/\*\.skill\.md/);
  });

  it("umbrella omits project skills line when no project skills", () => {
    const out = render({ harness, engines: ["claude-code"] });
    const umbrella = out.files.find((f) => f.path === "AGENTS.md");
    expect(umbrella?.content).not.toMatch(/docs\/skills/);
  });

  it("umbrella mentions the quality pillar only when the project has one", () => {
    const withQuality = render({ harness, engines: ["claude-code"], hasQualityDoc: true });
    expect(withQuality.files.find((f) => f.path === "AGENTS.md")?.content).toMatch(
      /docs\/quality\/code-quality\.md/,
    );
    const without = render({ harness, engines: ["claude-code"] });
    expect(without.files.find((f) => f.path === "AGENTS.md")?.content).not.toMatch(/docs\/quality/);
  });
});
