import { describe, expect, it } from "vitest";
import { parseAgent } from "../parser/agent.js";
import { parseCmd } from "../parser/cmd.js";
import { parseSkill } from "../parser/skill.js";
import { getRenderer } from "./index.js";

const SKILL_SRC = `---
id: doc-audit
description: Audit doc.
engines: [claude-code, codex-cli, opencode]
tags: [audit, doc]
---

# Doc Audit

Body.
`;

const SKILL_MULTI_STEP = `---
id: multi-skill
description: Multi-step skill.
requires: [multi-step]
---

Body.
`;

const SKILL_CLAUDE_ONLY = `---
id: only-claude
description: Claude-only.
engines: [claude-code]
---

Body.
`;

const CMD_SRC = `---
id: doc-audit
trigger: /doc-audit
invokes_skill: doc-audit
args:
  - name: scope
    type: enum
    values: [spec, all]
    default: all
description: Audit doc scope.
---

# /doc-audit
`;

const AGENT_SRC = `---
id: coding
description: Coding agent.
---

# Coding Agent

Workflow.
`;

describe("claudeCodeRenderer", () => {
  const r = getRenderer("claude-code");

  it("renders skill under .claude/skills/<id>/SKILL.md", () => {
    const skill = parseSkill("doc-audit.skill.md", SKILL_SRC);
    const result = r.renderSkill(skill);
    expect(result.files[0]?.path).toBe(".claude/skills/doc-audit/SKILL.md");
    expect(result.files[0]?.content).toMatch(/^---\nname: doc-audit/);
    expect(result.files[0]?.content).toMatch(/# Doc Audit/);
    expect(result.warnings).toEqual([]);
  });

  it("renders cmd under .claude/commands/<id>.md", () => {
    const cmd = parseCmd("doc-audit.cmd.md", CMD_SRC);
    const result = r.renderCmd(cmd);
    expect(result.files[0]?.path).toBe(".claude/commands/doc-audit.md");
    expect(result.files[0]?.content).toMatch(/trigger: \/doc-audit/);
  });

  it("renders subagents under .claude/agents/<id>.md with Claude Code frontmatter", () => {
    const agent = parseAgent("coding.agent.md", AGENT_SRC);
    const result = r.renderAgents([agent]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(".claude/agents/coding.md");
    expect(result.files[0]?.content).toMatch(/^---\nname: coding\n/);
    expect(result.files[0]?.content).toMatch(/# Coding Agent/);
    expect(result.files[0]?.content).not.toMatch(/## Available/);
  });

  it("renders skill that requires multi-step (supported on claude-code)", () => {
    const skill = parseSkill("m.skill.md", SKILL_MULTI_STEP);
    const result = r.renderSkill(skill);
    expect(result.files.length).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("skips skill with engine restriction (claude-only on opencode)", () => {
    const skill = parseSkill("o.skill.md", SKILL_CLAUDE_ONLY);
    const opencode = getRenderer("opencode");
    const result = opencode.renderSkill(skill);
    expect(result.files).toEqual([]);
    expect(result.warnings.length).toBe(1);
  });
});

describe("codexCliRenderer", () => {
  const r = getRenderer("codex-cli");

  it("renders skill to .agents/skills/<id>/SKILL.md (the only repo dir Codex scans)", () => {
    const skill = parseSkill("doc-audit.skill.md", SKILL_SRC);
    const result = r.renderSkill(skill);
    expect(result.files[0]?.path).toBe(".agents/skills/doc-audit/SKILL.md");
    expect(result.files[0]?.content).toMatch(/^---\nname: doc-audit/);
  });

  it("renders no command file (custom prompts are deprecated in Codex)", () => {
    const cmd = parseCmd("doc-audit.cmd.md", CMD_SRC);
    expect(r.renderCmd(cmd)).toEqual({ files: [], warnings: [] });
  });

  it("renders subagents as TOML under .codex/agents/<id>.toml", () => {
    const agent = parseAgent("coding.agent.md", AGENT_SRC);
    const result = r.renderAgents([agent]);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(".codex/agents/coding.toml");
    const content = result.files[0]?.content ?? "";
    expect(content).toMatch(/^name = "coding"\ndescription = "Coding agent\."\n/);
    expect(content).toMatch(/developer_instructions = """\n# Coding Agent\n[\s\S]*\n"""\n$/);
  });

  it("escapes backslashes and triple quotes in developer_instructions", () => {
    const agent = parseAgent("coding.agent.md", `${AGENT_SRC}\nregex \\d and """quoted"""\n`);
    const content = r.renderAgents([agent]).files[0]?.content ?? "";
    expect(content).toContain('regex \\\\d and ""\\"quoted""\\"');
  });

  it("nests the Stop command under a hooks[] group", () => {
    const parsed = JSON.parse(r.renderStopHook().files[0]?.content ?? "{}");
    expect(parsed.hooks.Stop[0].hooks[0].type).toBe("command");
    expect(parsed.hooks.Stop[0].hooks[0].command).toMatch(/stop-hook --engine codex$/);
  });

  it("renders skill requiring multi-step on codex-cli with degradation warning", () => {
    const skill = parseSkill("m.skill.md", SKILL_MULTI_STEP);
    const result = r.renderSkill(skill);
    expect(result.files.length).toBe(1);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/degradation/);
  });
});

describe("opencodeRenderer", () => {
  const r = getRenderer("opencode");

  it("renders skill to .opencode/skills/<id>/SKILL.md with YAML frontmatter", () => {
    const skill = parseSkill("doc-audit.skill.md", SKILL_SRC);
    const result = r.renderSkill(skill);
    expect(result.files[0]?.path).toBe(".opencode/skills/doc-audit/SKILL.md");
    expect(result.files[0]?.content).toMatch(/^---\nname: doc-audit\n/);
  });

  it("renders cmd to .opencode/commands/<id>.md with a YAML description only", () => {
    const cmd = parseCmd("doc-audit.cmd.md", CMD_SRC);
    const result = r.renderCmd(cmd);
    expect(result.files[0]?.path).toBe(".opencode/commands/doc-audit.md");
    expect(result.files[0]?.content).toMatch(/^---\ndescription: Audit doc scope\.\n---\n/);
  });

  it("renders agents with YAML description + mode, named by file", () => {
    const agent = parseAgent("coding.agent.md", AGENT_SRC);
    const result = r.renderAgents([agent]);
    expect(result.files[0]?.path).toBe(".opencode/agents/coding.md");
    expect(result.files[0]?.content).toMatch(/^---\ndescription: Coding agent\.\nmode: all\n---\n/);
  });

  it("renders the stop hook as one plugin module for OpenCode 1.x and 2.x", () => {
    const file = r.renderStopHook().files[0];
    expect(file?.path).toBe(".opencode/plugins/harness-stop-hook.ts");
    expect(file?.content).toMatch(/export default \{\n {2}id: "vaubaan-harness-stop-hook",/);
    expect(file?.content).toMatch(/server: HarnessStopHook,/);
    expect(file?.content).toMatch(/setup\(context\)/);
    expect(file?.content.match(/^export /gm)).toHaveLength(1);
    expect(file?.content).toMatch(/event\.type !== "session\.idle"/);
    expect(file?.content).toMatch(/"stop-hook", "--engine", "opencode"/);
  });
});

describe("renderMcp", () => {
  const context7 = {
    id: "context7" as const,
    description: "Upstash context7.",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
  };

  it("claude-code emits .mcp.json at root with mcpServers field", () => {
    const result = getRenderer("claude-code").renderMcp([context7]);
    expect(result.files[0]?.path).toBe(".mcp.json");
    const parsed = JSON.parse(result.files[0]?.content ?? "{}");
    expect(parsed.mcpServers.context7.command).toBe("npx");
    expect(parsed.mcpServers.context7.args).toEqual(["-y", "@upstash/context7-mcp"]);
  });

  it("codex-cli emits .codex/config.toml with [mcp_servers.<id>] block", () => {
    const result = getRenderer("codex-cli").renderMcp([context7]);
    expect(result.files[0]?.path).toBe(".codex/config.toml");
    expect(result.files[0]?.content).toMatch(/\[mcp_servers\.context7\]/);
    expect(result.files[0]?.content).toMatch(/command = "npx"/);
    expect(result.files[0]?.content).toMatch(/args = \["-y", "@upstash\/context7-mcp"\]/);
  });

  it("opencode emits .opencode/opencode.json with mcp field", () => {
    const result = getRenderer("opencode").renderMcp([context7]);
    expect(result.files[0]?.path).toBe(".opencode/opencode.json");
    const parsed = JSON.parse(result.files[0]?.content ?? "{}");
    expect(parsed.mcp.context7.type).toBe("local");
    expect(parsed.mcp.context7.command).toEqual(["npx", "-y", "@upstash/context7-mcp"]);
    expect(parsed.mcp.context7.enabled).toBe(true);
  });

  it("emits nothing when given an empty server list", () => {
    for (const engine of ["claude-code", "codex-cli", "opencode"] as const) {
      const result = getRenderer(engine).renderMcp([]);
      expect(result.files).toEqual([]);
    }
  });
});
