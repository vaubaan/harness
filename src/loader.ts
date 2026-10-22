import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { z } from "zod";
import { parseCmd } from "./parser/cmd.js";
import { type Skill, parseSkill } from "./parser/skill.js";
import type { Harness, HarnessOverrides } from "./render.js";
import { parseYAML } from "./util/yaml.js";

export const DisableYamlSchema = z
  .object({ disable: z.array(z.string()).optional() })
  .passthrough();

export interface LoadOptions {
  skillsDir?: string;
  commandsDir?: string;
}

export function loadHarness(packageDir: string, opts: LoadOptions = {}): Harness {
  const skillsDir = opts.skillsDir ?? join(packageDir, "skills");
  const commandsDir = opts.commandsDir ?? join(packageDir, "commands");

  const skillFiles = fg.sync("*.skill.md", { cwd: skillsDir, absolute: true });
  const cmdFiles = fg.sync("*.cmd.md", { cwd: commandsDir, absolute: true });

  return {
    skills: skillFiles.map((f) => parseSkill(f, readFileSync(f, "utf8"))),
    cmds: cmdFiles.map((f) => parseCmd(f, readFileSync(f, "utf8"))),
  };
}

export function loadProjectSkills(targetDir: string): Skill[] {
  const skillsDir = join(targetDir, "docs", "skills");
  if (!existsSync(skillsDir)) return [];
  const skillFiles = fg.sync("*.skill.md", { cwd: skillsDir, absolute: true });
  return skillFiles.map((f) => parseSkill(f, readFileSync(f, "utf8")));
}

export function loadOverrides(worktreeDir: string): HarnessOverrides | undefined {
  const overridesDir = join(worktreeDir, ".harness-overrides");
  if (!existsSync(overridesDir)) return undefined;

  const added = loadHarness(overridesDir, {
    skillsDir: join(overridesDir, "skills"),
    commandsDir: join(overridesDir, "commands"),
  });

  const disablePath = join(overridesDir, "disable.yaml");
  let disable: string[] = [];
  if (existsSync(disablePath)) {
    try {
      const parsed = DisableYamlSchema.safeParse(parseYAML(readFileSync(disablePath, "utf8")));
      if (parsed.success && parsed.data.disable) {
        disable = parsed.data.disable;
      }
    } catch {
      // corrupt YAML — leave disable as []
    }
  }

  return { add: added, disable };
}
