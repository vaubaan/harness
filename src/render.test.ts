import { describe, expect, it } from "vitest";
import { resolveMcpIds } from "./mcp.js";
import { parseAgent } from "./parser/agent.js";
import { parseCmd } from "./parser/cmd.js";
import { parseSkill } from "./parser/skill.js";
import { type Harness, RenderError, applyOverrides, render } from "./render.js";

function mkAgent(id: "coding" | "review" | "merge" | "planning") {
  return parseAgent(
    `${id}.agent.md`,
    `---
id: ${id}
description: ${id} agent.
---

# ${id} Agent
`,
  );
}

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

describe("render — multi-engine, multi-agent harness", () => {
  const harness: Harness = {
    agents: [mkAgent("coding"), mkAgent("review")],
    skills: [mkSkill("doc-audit"), mkSkill("decision-record-writer"), mkSkill("handbook-writer")],
    cmds: [
      mkCmd("doc-audit", "doc-audit"),
      mkCmd("decision", "decision-record-writer"),
      mkCmd("handbook", "handbook-writer"),
    ],
  };

  it("claude-code: emits AGENTS.md umbrella + CLAUDE.md + subagents under .claude/", () => {
    const out = render({ harness, engines: ["claude-code"], withStopHook: false });
    const paths = out.files.map((f) => f.path).sort();
    expect(paths).toEqual([
      ".claude/agents/coding.md",
      ".claude/agents/review.md",
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

  it("emits a stop-hook config per engine by default (withStopHook unspecified)", () => {
    const out = render({ harness, engines: ["claude-code", "codex-cli", "opencode"] });
    const paths = out.files.map((f) => f.path);
    expect(paths).toContain(".claude/settings.json");
    expect(paths).toContain(".codex/hooks.json");
    expect(paths).toContain(".opencode/plugins/harness-stop-hook.ts");
  });

  it("withStopHook: false suppresses every engine's stop-hook config", () => {
    const out = render({
      harness,
      engines: ["claude-code", "codex-cli", "opencode"],
      withStopHook: false,
    });
    const paths = out.files.map((f) => f.path);
    expect(paths).not.toContain(".claude/settings.json");
    expect(paths).not.toContain(".codex/hooks.json");
    expect(paths).not.toContain(".opencode/plugins/harness-stop-hook.ts");
  });

  it("stop-hook commands reference @vaubaan/harness stop-hook --engine <X>", () => {
    const out = render({ harness, engines: ["claude-code", "codex-cli", "opencode"] });
    const settings = out.files.find((f) => f.path === ".claude/settings.json");
    expect(settings?.content).toMatch(/stop-hook --engine claude/);
    const codex = out.files.find((f) => f.path === ".codex/hooks.json");
    expect(codex?.content).toMatch(/stop-hook --engine codex/);
    const opencode = out.files.find((f) => f.path === ".opencode/plugins/harness-stop-hook.ts");
    expect(opencode?.content).toMatch(/stop-hook.*--engine.*opencode/);
  });

  it("multi-engine: claude-code + codex-cli emit under each .<engine>/ + 1 umbrella + claude stub", () => {
    const out = render({ harness, engines: ["claude-code", "codex-cli"] });
    const paths = out.files.map((f) => f.path).sort();
    expect(paths).toContain(".claude/agents/coding.md");
    expect(paths).toContain(".codex/agents/coding.toml");
    expect(paths).toContain(".agents/skills/doc-audit/SKILL.md");
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
    // AGENTS.md is emitted exactly once
    expect(paths.filter((p) => p === "AGENTS.md")).toHaveLength(1);
  });

  it("codex-only install: no CLAUDE.md stub", () => {
    const out = render({ harness, engines: ["codex-cli"] });
    const paths = out.files.map((f) => f.path);
    expect(paths).not.toContain("CLAUDE.md");
    expect(paths).toContain("AGENTS.md");
  });

  it("AGENTS.md umbrella exposes work method + skills + commands (no persona list, no harness meta)", () => {
    const out = render({ harness, engines: ["claude-code"] });
    const umbrella = out.files.find((f) => f.path === "AGENTS.md");
    expect(umbrella?.content).toMatch(/How we work/);
    expect(umbrella?.content).toMatch(/Project map/);
    expect(umbrella?.content).toMatch(/Doc-first/);
    expect(umbrella?.content).toMatch(/doc-audit/);
    expect(umbrella?.content).toMatch(/decision-record-writer/);
    // Method-first, not meta-first: no harness self-narrative, no persona list.
    expect(umbrella?.content).not.toMatch(/Vaubaan-harnessed project/);
    expect(umbrella?.content).not.toMatch(/Personas disponibles/);
  });

  it("each claude-code subagent file carries proper frontmatter (name/description)", () => {
    const out = render({ harness, engines: ["claude-code"] });
    const coding = out.files.find((f) => f.path === ".claude/agents/coding.md");
    expect(coding?.content).toMatch(/^---\nname: coding\n/);
    expect(coding?.content).toMatch(/description: coding agent\./);
    expect(coding?.content).toMatch(/# coding Agent/);
  });

  it("throws RenderError when the harness has zero agents", () => {
    const empty: Harness = { ...harness, agents: [] };
    expect(() => render({ harness: empty, engines: ["claude-code"] })).toThrow(RenderError);
  });

  it("throws RenderError when engines list is empty", () => {
    expect(() => render({ harness, engines: [] })).toThrow(RenderError);
  });

  it("codex-cli renders skills requiring multi-step with degradation warning", () => {
    const h: Harness = {
      ...harness,
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

  it("opencode drops its own skill copy when another rendered engine already exposes it", () => {
    const out = render({ harness, engines: ["opencode", "claude-code"], withStopHook: false });
    const paths = out.files.map((f) => f.path);
    expect(paths).toContain(".claude/skills/doc-audit/SKILL.md");
    expect(paths.some((p) => p.startsWith(".opencode/skills/"))).toBe(false);
    expect(paths).toContain(".opencode/commands/doc-audit.md");
  });

  it("CLAUDE.md is an @AGENTS.md import and personas carry no skill/command lists", () => {
    const out = render({ harness, engines: ["claude-code"], withStopHook: false });
    expect(out.files.find((f) => f.path === "CLAUDE.md")?.content).toBe("@AGENTS.md\n");
    const persona = out.files.find((f) => f.path === ".claude/agents/coding.md");
    expect(persona?.content).not.toMatch(/## Available/);
    const umbrella = out.files.find((f) => f.path === "AGENTS.md");
    expect(umbrella?.content).toMatch(/## Doc-skills\n\n- `/);
  });

  it("opencode emits skills + agents under .opencode/", () => {
    const out = render({ harness, engines: ["opencode"], withStopHook: false });
    const skillPaths = out.files.filter((f) => f.path.includes("/skills/")).map((f) => f.path);
    expect(skillPaths.sort()).toEqual([
      ".opencode/skills/decision-record-writer/SKILL.md",
      ".opencode/skills/doc-audit/SKILL.md",
      ".opencode/skills/handbook-writer/SKILL.md",
    ]);
    const agentPaths = out.files.filter((f) => f.path.includes("/agents/")).map((f) => f.path);
    expect(agentPaths.sort()).toEqual([".opencode/agents/coding.md", ".opencode/agents/review.md"]);
  });

  it("does not emit MCP files when mcpServers is omitted (opt-in)", () => {
    const out = render({ harness, engines: ["claude-code", "codex-cli", "opencode"] });
    const paths = out.files.map((f) => f.path);
    expect(paths).not.toContain(".mcp.json");
    expect(paths).not.toContain(".codex/config.toml");
    expect(paths).not.toContain(".opencode/opencode.json");
  });

  it("emits MCP config per engine when mcpServers: [context7] is set", () => {
    const out = render({
      harness,
      engines: ["claude-code", "codex-cli", "opencode"],
      mcpServers: ["context7"],
    });
    const paths = out.files.map((f) => f.path);
    expect(paths).toContain(".mcp.json");
    expect(paths).toContain(".codex/config.toml");
    expect(paths).toContain(".opencode/opencode.json");
  });
});

describe("applyOverrides", () => {
  it("disables a skill by id", () => {
    const h: Harness = {
      agents: [mkAgent("coding")],
      skills: [mkSkill("a"), mkSkill("b")],
      cmds: [mkCmd("a", "a"), mkCmd("b", "b")],
    };
    const out = applyOverrides(h, { disable: ["b"] });
    expect(out.skills.map((s) => s.meta.id)).toEqual(["a"]);
    expect(out.cmds.map((c) => c.meta.id)).toEqual(["a"]);
  });

  it("overrides a skill with same id (override wins)", () => {
    const h: Harness = {
      agents: [],
      skills: [mkSkill("a", { engines: ["claude-code"] })],
      cmds: [],
    };
    const override = mkSkill("a", { engines: ["opencode"] });
    const out = applyOverrides(h, { add: { skills: [override] } });
    expect(out.skills).toHaveLength(1);
    expect(out.skills[0]?.meta.engines).toEqual(["opencode"]);
  });

  it("adds new skill that doesn't exist in stock", () => {
    const h: Harness = { agents: [], skills: [], cmds: [] };
    const newSkill = mkSkill("new-one");
    const out = applyOverrides(h, { add: { skills: [newSkill] } });
    expect(out.skills.map((s) => s.meta.id)).toEqual(["new-one"]);
  });
});

describe("render with projectSkills", () => {
  const harness: Harness = {
    agents: [mkAgent("coding")],
    skills: [mkSkill("stock-skill")],
    cmds: [],
  };

  it("project skills are rendered alongside stock skills", () => {
    const projectSkill = mkSkill("project-guide");
    const out = render({
      harness,
      engines: ["claude-code"],
      projectSkills: [projectSkill],
      withStopHook: false,
    });
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
    const out = render({
      harness,
      engines: ["opencode"],
      projectSkills: [projectOverride],
      withStopHook: false,
    });
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
      withStopHook: false,
    });
    const skillPaths = out.files.filter((f) => f.path.includes("/skills/")).map((f) => f.path);
    expect(skillPaths).toEqual([".claude/skills/stock-skill/SKILL.md"]);
  });

  it("umbrella mentions project skills in 'Project map' when present", () => {
    const out = render({
      harness,
      engines: ["claude-code"],
      projectSkills: [mkSkill("my-guide")],
      withStopHook: false,
    });
    const umbrella = out.files.find((f) => f.path === "AGENTS.md");
    expect(umbrella?.content).toMatch(/docs\/skills\/\*\.skill\.md/);
  });

  it("umbrella omits project skills line when no project skills", () => {
    const out = render({
      harness,
      engines: ["claude-code"],
      withStopHook: false,
    });
    const umbrella = out.files.find((f) => f.path === "AGENTS.md");
    expect(umbrella?.content).not.toMatch(/docs\/skills/);
  });
});

describe("resolveMcpIds", () => {
  it("resolveMcpIds throws on unknown server id", () => {
    expect(() => resolveMcpIds(["unknown-server"])).toThrow("unknown MCP server: unknown-server");
  });
});
