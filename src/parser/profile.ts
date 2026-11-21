import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { entitySlug } from "../linters/intent-vocabulary.js";
import { maskFencedCode, parseHeading } from "./intent.js";
import { type ProfileFrontmatter, Schemas } from "./schemas.js";

/** The profiles pillar (docs/spec/coding-agent-harness.md §9.1.4). */
export const PROFILES_DIR = "docs/profiles";
/** The generated index of the pillar; never a profile file. */
export const PROFILES_INDEX_PATH = `${PROFILES_DIR}/README.md`;

export interface ProfileError {
  line?: number;
  message: string;
}

/** A pain or a gain: a bullet that opens with its name in bold. */
export interface ProfileItem {
  name: string;
  /** `**Context rot**` gives `context-rot`, like an entity of the spec. */
  slug: string;
  /** 1-based line of the bullet. */
  line: number;
}

export interface ProfileFile {
  meta?: ProfileFrontmatter;
  title: string;
  /** In rank order: the first is the most severe. */
  pains: ProfileItem[];
  gains: ProfileItem[];
  errors: ProfileError[];
}

export interface ParsedProfileFile extends ProfileFile {
  /** Path from the repo root, e.g. `docs/profiles/lead-developer.md`. */
  path: string;
  /** File name, e.g. `lead-developer.md`. */
  file: string;
  /** The profile's name wherever it is referred to: the file name without `.md`. */
  slug: string;
}

// English headings are canonical; the French ones are accepted like the
// ADR and quality headings.
const PAINS_HEADING = /^(Pains|Irritants|Douleurs)\s*$/i;
const GAINS_HEADING = /^(Gains|B[ée]n[ée]fices)\s*$/i;
const BULLET = /^[-*]\s+(.*)$/;
const NAMED = /^\*\*([^*]+)\*\*/;

function parseFrontmatter(text: string, errors: ProfileError[]): ProfileFrontmatter | undefined {
  let data: Record<string, unknown>;
  try {
    data = matter(text).data;
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    errors.push({ line: 1, message: `invalid frontmatter YAML: ${reason}` });
    return undefined;
  }
  const result = Schemas.Profile.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const where = issue.path.length ? ` \`${issue.path.join(".")}\`` : "";
    errors.push({ line: 1, message: `frontmatter${where}: ${issue.message}` });
  }
  return undefined;
}

/**
 * Parses one profile file. Never throws: problems are collected in `errors`
 * so a linter reports everything at once and the index still renders.
 */
export function parseProfileFile(relPath: string, text: string): ProfileFile {
  const errors: ProfileError[] = [];
  const meta = parseFrontmatter(text, errors);
  const lines = maskFencedCode(text.split(/\r?\n/));
  const pains: ProfileItem[] = [];
  const gains: ProfileItem[] = [];
  let h1: string | undefined;
  let current: { kind: "pain" | "gain"; depth: number; items: ProfileItem[] } | undefined;
  // Skip the frontmatter block: its `---` lines and keys are not body.
  let start = 0;
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line));
    start = end < 0 ? lines.length : end + 1;
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = parseHeading(line);
    if (heading) {
      if (heading.depth === 1 && h1 === undefined) h1 = heading.title;
      if (current && heading.depth > current.depth) continue;
      if (PAINS_HEADING.test(heading.title)) {
        current = { kind: "pain", depth: heading.depth, items: pains };
      } else if (GAINS_HEADING.test(heading.title)) {
        current = { kind: "gain", depth: heading.depth, items: gains };
      } else {
        current = undefined;
      }
      continue;
    }
    if (!current) continue;
    const bullet = BULLET.exec(line)?.[1];
    if (bullet === undefined) continue;
    const name = NAMED.exec(bullet)?.[1]?.trim();
    const slug = name ? entitySlug(name) : "";
    if (!name || !slug) {
      errors.push({ line: i + 1, message: `a ${current.kind} opens with its name in bold` });
      continue;
    }
    if (current.items.some((item) => item.slug === slug)) {
      errors.push({ line: i + 1, message: `duplicate ${current.kind} \`${slug}\`` });
      continue;
    }
    current.items.push({ name, slug, line: i + 1 });
  }
  if (pains.length === 0 && gains.length === 0) {
    errors.push({ message: "a profile names at least one pain or one gain" });
  }
  const title = meta?.title ?? h1 ?? basename(relPath, ".md");
  return { ...(meta ? { meta } : {}), title, pains, gains, errors };
}

/** Profile files: `docs/profiles/*.md` minus the generated index, sorted by file name. */
export function listProfileFiles(targetDir: string): string[] {
  const dir = join(targetDir, PROFILES_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
}

/** Parses every profile file without throwing; linters read their `errors`. */
export function readProfileFiles(targetDir: string): ParsedProfileFile[] {
  return listProfileFiles(targetDir).map((file) => {
    const path = `${PROFILES_DIR}/${file}`;
    const text = readFileSync(join(targetDir, path), "utf8");
    return { path, file, slug: basename(file, ".md"), ...parseProfileFile(path, text) };
  });
}

/** The frontmatter `evidence:` as a list. */
export function profileEvidence(meta: ProfileFrontmatter | undefined): string[] {
  if (!meta?.evidence) return [];
  return typeof meta.evidence === "string" ? [meta.evidence] : [...meta.evidence];
}
