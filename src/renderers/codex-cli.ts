import type { McpServerSpec } from "../mcp.js";
import type { Agent } from "../parser/agent.js";
import type { Cmd } from "../parser/cmd.js";
import type { Skill } from "../parser/skill.js";
import type { Engine } from "../types.js";
import {
  type RenderResult,
  type Renderer,
  STOP_HOOK_PACKAGE,
  buildAgentBody,
  checkSkillCapabilities,
  frontmatterDataForSkill,
  isSkillEngineAllowed,
  tomlInlineArray,
  tomlInlineTable,
  tomlMultilineString,
  tomlQuoteString,
  yamlFrontmatter,
} from "./common.js";

const ENGINE: Engine = "codex-cli";
const BASE = ".codex";
// Codex discovers repo skills under `.agents/skills/` only — `.codex/skills/` is not scanned.
const SKILLS_BASE = ".agents/skills";

export const codexCliRenderer: Renderer = {
  engine: ENGINE,
  renderSkill(skill: Skill): RenderResult {
    if (!isSkillEngineAllowed(skill, ENGINE)) {
      return {
        files: [],
        warnings: [`skill "${skill.meta.id}" excluded from engine "${ENGINE}"`],
      };
    }
    const check = checkSkillCapabilities(skill, ENGINE);
    if (check.blockingWarnings.length > 0) {
      return { files: [], warnings: check.blockingWarnings };
    }
    const content = `${yamlFrontmatter(frontmatterDataForSkill(skill))}\n${skill.body}\n`;
    return {
      files: [{ path: `${SKILLS_BASE}/${skill.meta.id}/SKILL.md`, content }],
      warnings: check.degradedWarnings,
    };
  },
  // Codex custom prompts are deprecated in favour of skills: nothing to render.
  renderCmd(_cmd: Cmd): RenderResult {
    return { files: [], warnings: [] };
  },
  renderAgents(agents: ReadonlyArray<Agent>): RenderResult {
    const files = [];
    for (const agent of agents) {
      const content = [
        `name = ${tomlQuoteString(agent.meta.id)}`,
        `description = ${tomlQuoteString(agent.meta.description)}`,
        `developer_instructions = ${tomlMultilineString(buildAgentBody(agent).trimEnd())}`,
        "",
      ].join("\n");
      files.push({ path: `${BASE}/agents/${agent.meta.id}.toml`, content });
    }
    return { files, warnings: [] };
  },
  renderMcp(servers: ReadonlyArray<McpServerSpec>): RenderResult {
    if (servers.length === 0) return { files: [], warnings: [] };
    const blocks: string[] = [];
    for (const s of servers) {
      const lines = [
        `[mcp_servers.${s.id}]`,
        `command = ${tomlQuoteString(s.command)}`,
        `args = ${tomlInlineArray([...s.args])}`,
      ];
      if (s.env) lines.push(`env = ${tomlInlineTable(s.env)}`);
      blocks.push(lines.join("\n"));
    }
    const content = `${blocks.join("\n\n")}\n`;
    return { files: [{ path: `${BASE}/config.toml`, content }], warnings: [] };
  },
  renderStopHook(): RenderResult {
    const hooks = {
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: `npx -y ${STOP_HOOK_PACKAGE} stop-hook --engine codex`,
              },
            ],
          },
        ],
      },
    };
    return {
      files: [{ path: `${BASE}/hooks.json`, content: `${JSON.stringify(hooks, null, 2)}\n` }],
      warnings: [],
    };
  },
};
