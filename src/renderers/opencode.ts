import type { Cmd } from "../parser/cmd.js";
import type { Skill } from "../parser/skill.js";
import type { Engine } from "../types.js";
import {
  type RenderResult,
  type Renderer,
  checkSkillCapabilities,
  frontmatterDataForSkill,
  isSkillEngineAllowed,
  yamlFrontmatter,
} from "./common.js";

const ENGINE: Engine = "opencode";
const BASE = ".opencode";

export const opencodeRenderer: Renderer = {
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
    // OpenCode names the command after the file; only `description` is a known key.
    const content = `${yamlFrontmatter({ description: cmd.meta.description })}\n${cmd.body}\n`;
    return {
      files: [{ path: `${BASE}/commands/${cmd.meta.id}.md`, content }],
      warnings: [],
    };
  },
};
