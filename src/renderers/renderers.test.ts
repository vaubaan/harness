import { describe, expect, it } from "vitest";
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

  it("does not propagate build-time constraints (engines, requires) to the output", () => {
    const skill = parseSkill("m.skill.md", SKILL_MULTI_STEP);
    const content = r.renderSkill(skill).files[0]?.content ?? "";
    expect(content).not.toMatch(/requires/);
    expect(content).not.toMatch(/engines/);
  });

  it("renders cmd under .claude/commands/<id>.md", () => {
    const cmd = parseCmd("doc-audit.cmd.md", CMD_SRC);
    const result = r.renderCmd(cmd);
    expect(result.files[0]?.path).toBe(".claude/commands/doc-audit.md");
    expect(result.files[0]?.content).toMatch(/trigger: \/doc-audit/);
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

  it("exposes only renderSkill and renderCmd: no persona, no hook, no MCP", () => {
    for (const engine of ["claude-code", "codex-cli", "opencode"] as const) {
      const renderer = getRenderer(engine) as unknown as Record<string, unknown>;
      expect(renderer.renderAgents).toBeUndefined();
      expect(renderer.renderStopHook).toBeUndefined();
      expect(renderer.renderMcp).toBeUndefined();
    }
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
});
