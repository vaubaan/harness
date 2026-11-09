import { posix } from "node:path";
import type { JourneyFrontmatter } from "../parser/schemas.js";

/** The frontmatter `spec:` as a list. */
export function journeySpecs(meta: JourneyFrontmatter | undefined): string[] {
  if (!meta) return [];
  return typeof meta.spec === "string" ? [meta.spec] : [...meta.spec];
}

/** A `spec:` path, relative to the journey file, as a path from the repo root (fragment stripped). */
export function resolveSpecPath(journeyPath: string, spec: string): string {
  const withoutFragment = spec.split("#")[0] ?? "";
  return posix.normalize(posix.join(posix.dirname(journeyPath), withoutFragment));
}
