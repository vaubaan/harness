import { readFileSync } from "node:fs";
import matter from "gray-matter";
import type { z } from "zod";
import { ParseError } from "./schemas.js";

export interface ParsedFile<T> {
  meta: T;
  body: string;
  sourcePath: string;
}

export function parseWithSchema<T extends z.ZodTypeAny>(
  filePath: string,
  source: string,
  schema: T,
): ParsedFile<z.infer<T>> {
  const parsed = matter(source);
  const result = schema.safeParse(parsed.data);
  if (!result.success) {
    throw new ParseError(filePath, result.error.issues);
  }
  return {
    meta: result.data,
    body: parsed.content.trim(),
    sourcePath: filePath,
  };
}

export function parseFileWithSchema<T extends z.ZodTypeAny>(
  filePath: string,
  schema: T,
): ParsedFile<z.infer<T>> {
  const source = readFileSync(filePath, "utf8");
  return parseWithSchema(filePath, source, schema);
}
