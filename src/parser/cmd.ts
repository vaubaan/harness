import { parseFileWithSchema, parseWithSchema } from "./common.js";
import type { ParsedFile } from "./common.js";
import { type CmdFrontmatter, Schemas } from "./schemas.js";

export type Cmd = ParsedFile<CmdFrontmatter>;

export function parseCmd(filePath: string, source: string): Cmd {
  return parseWithSchema(filePath, source, Schemas.Cmd);
}

export function parseCmdFile(filePath: string): Cmd {
  return parseFileWithSchema(filePath, Schemas.Cmd);
}
