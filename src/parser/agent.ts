import { parseFileWithSchema, parseWithSchema } from "./common.js";
import type { ParsedFile } from "./common.js";
import { type AgentFrontmatter, Schemas } from "./schemas.js";

export type Agent = ParsedFile<AgentFrontmatter>;

export function parseAgent(filePath: string, source: string): Agent {
  return parseWithSchema(filePath, source, Schemas.Agent);
}

export function parseAgentFile(filePath: string): Agent {
  return parseFileWithSchema(filePath, Schemas.Agent);
}
