import { posix } from "node:path";
import type { IntentFrontmatter } from "../parser/schemas.js";

/** The frontmatter `spec:` as a list. */
export function intentFileSpecs(meta: IntentFrontmatter | undefined): string[] {
  if (!meta) return [];
  return typeof meta.spec === "string" ? [meta.spec] : [...meta.spec];
}

/** A `spec:` path, relative to the intent file, as a path from the repo root (fragment stripped). */
export function resolveSpecPath(filePath: string, spec: string): string {
  const withoutFragment = spec.split("#")[0] ?? "";
  return posix.normalize(posix.join(posix.dirname(filePath), withoutFragment));
}
