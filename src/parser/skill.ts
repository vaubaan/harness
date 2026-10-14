import { parseFileWithSchema, parseWithSchema } from "./common.js";
import type { ParsedFile } from "./common.js";
import { Schemas, type SkillFrontmatter } from "./schemas.js";

export type Skill = ParsedFile<SkillFrontmatter>;

export function parseSkill(filePath: string, source: string): Skill {
  return parseWithSchema(filePath, source, Schemas.Skill);
}

export function parseSkillFile(filePath: string): Skill {
  return parseFileWithSchema(filePath, Schemas.Skill);
}
