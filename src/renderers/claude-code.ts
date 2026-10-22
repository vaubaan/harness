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
  frontmatterDataForCmd,
  frontmatterDataForSkill,
  isSkillEngineAllowed,
  yamlFrontmatter,
} from "./common.js";

const ENGINE: Engine = "claude-code";
const BASE = ".claude";

export const claudeCodeRenderer: Renderer = {
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
      files: [{ path: `${BASE}/skills/${skill.meta.id}/SKILL.md`, content }],
      warnings: check.degradedWarnings,
    };
  },
  renderCmd(cmd: Cmd): RenderResult {
    const content = `${yamlFrontmatter(frontmatterDataForCmd(cmd))}\n${cmd.body}\n`;
    return {
      files: [{ path: `${BASE}/commands/${cmd.meta.id}.md`, content }],
      warnings: [],
    };
  },
  renderAgents(agents: ReadonlyArray<Agent>): RenderResult {
    const files = [];
    for (const agent of agents) {
      const subagentFrontmatter = yamlFrontmatter({
        name: agent.meta.id,
        description: agent.meta.description,
      });
      const body = buildAgentBody(agent);
      const content = `${subagentFrontmatter}\n${body}`;
      files.push({ path: `${BASE}/agents/${agent.meta.id}.md`, content });
    }
    return { files, warnings: [] };
  },
  renderStopHook(): RenderResult {
    const settings = {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: `npx -y ${STOP_HOOK_PACKAGE} stop-hook --engine claude`,
              },
            ],
          },
        ],
      },
    };
    return {
      files: [{ path: `${BASE}/settings.json`, content: `${JSON.stringify(settings, null, 2)}\n` }],
      warnings: [],
    };
  },
};
