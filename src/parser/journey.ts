import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import {
  JOURNEY_STATUSES,
  type JourneyFrontmatter,
  type JourneyStatus,
  Schemas,
} from "./schemas.js";

/** The optional journeys pillar (docs/spec/coding-agent-harness.md §9.1.3). */
export const JOURNEYS_DIR = "docs/journeys";
/** The generated index of the pillar; never a journey. */
export const JOURNEYS_INDEX_PATH = `${JOURNEYS_DIR}/README.md`;

export const NODE_FIELDS = [
  "status",
  "spec",
  "anchors",
  "acceptance",
  "requires",
  "creates",
] as const;
export type NodeField = (typeof NODE_FIELDS)[number];
/** Fields only a story may carry. */
export const STORY_FIELDS: ReadonlyArray<NodeField> = [
  "anchors",
  "acceptance",
  "requires",
  "creates",
];

export interface JourneyError {
  line?: number;
  message: string;
}

export interface JourneyNode {
  title: string;
  /** Heading depth minus one: `##` is level 1. */
  level: number;
  /** 1-based line of the heading in the file. */
  line: number;
  /** Index of the parent node in `nodes`, absent for a level-1 node. */
  parent?: number;
  /** No deeper heading below it: a story (spec §9.1.3). */
  isStory: boolean;
  /** Line of each known field the node declares. */
  fieldLines: Partial<Record<NodeField, number>>;
  status?: JourneyStatus;
  spec?: string;
  anchors: string[];
  acceptance: string[];
  requires: string[];
  creates: string[];
  unknownFields: Array<{ key: string; line: number }>;
  /** Nearest `status:` up the tree, else the file status. */
  effectiveStatus?: JourneyStatus;
}

export interface JourneyParse {
  meta?: JourneyFrontmatter;
  title: string;
  /** The journey's user story, the first paragraph after the title; not a story node. */
  story?: string;
  nodes: JourneyNode[];
  errors: JourneyError[];
}

export interface ParsedJourney extends JourneyParse {
  /** Path from the repo root, e.g. `docs/journeys/harness-a-project.md`. */
  path: string;
  /** File name, e.g. `harness-a-project.md`. */
  file: string;
}

/** Stands for a line of fenced code: not blank, not a field, not a heading. */
const MASKED_LINE = "\u0000";
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FIELD_RE = /^([a-z][a-z-]*):\s*(.*)$/;
const LIST_ITEM_RE = /^\s*-\s+(.*)$/;

/** Replaces every line of fenced code (fences included), keeping line numbers. */
export function maskFencedCode(lines: ReadonlyArray<string>): string[] {
  let fence: string | undefined;
  return lines.map((line) => {
    const m = FENCE_RE.exec(line);
    if (fence !== undefined) {
      if (m?.[1] && m[1][0] === fence[0] && m[1].length >= fence.length) fence = undefined;
      return MASKED_LINE;
    }
    if (m?.[1]) {
      fence = m[1];
      return MASKED_LINE;
    }
    return line;
  });
}

export function parseHeading(line: string): { depth: number; title: string } | undefined {
  const m = HEADING_RE.exec(line);
  if (!m?.[1] || !m[2]) return undefined;
  return { depth: m[1].length, title: m[2] };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Index of the first body line, after the frontmatter block when there is one. */
function bodyStart(lines: ReadonlyArray<string>): number {
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]?.trim();
    if (l === "---" || l === "...") return i + 1;
  }
  return lines.length;
}

function parseFrontmatter(text: string, errors: JourneyError[]): JourneyFrontmatter | undefined {
  let data: Record<string, unknown>;
  try {
    data = matter(text).data;
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    errors.push({ line: 1, message: `invalid frontmatter YAML: ${reason}` });
    return undefined;
  }
  const result = Schemas.Journey.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const where = issue.path.length ? ` \`${issue.path.join(".")}\`` : "";
    errors.push({ line: 1, message: `frontmatter${where}: ${issue.message}` });
  }
  return undefined;
}

function newNode(title: string, level: number, line: number): JourneyNode {
  return {
    title,
    level,
    line,
    isStory: true,
    fieldLines: {},
    anchors: [],
    acceptance: [],
    requires: [],
    creates: [],
    unknownFields: [],
  };
}

/** Reads the field block directly under a heading, up to its first non-field line. */
function parseFields(
  node: JourneyNode,
  lines: ReadonlyArray<string>,
  from: number,
  to: number,
  errors: JourneyError[],
): void {
  let lastKey: string | undefined;
  for (let i = from; i < to; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const lineNo = i + 1;
    const field = FIELD_RE.exec(line.trimEnd());
    if (field?.[1] !== undefined) {
      const key = field[1];
      const value = (field[2] ?? "").trim();
      lastKey = key;
      if (!(NODE_FIELDS as ReadonlyArray<string>).includes(key)) {
        node.unknownFields.push({ key, line: lineNo });
        continue;
      }
      const known = key as NodeField;
      node.fieldLines[known] = lineNo;
      if (known === "status") {
        if ((JOURNEY_STATUSES as ReadonlyArray<string>).includes(value)) {
          node.status = value as JourneyStatus;
        } else {
          errors.push({
            line: lineNo,
            message: `invalid status \`${value}\` (expected ${JOURNEY_STATUSES.join(" | ")})`,
          });
        }
      } else if (known === "spec") {
        node.spec = value;
      } else if (known === "acceptance") {
        if (value) node.acceptance.push(value);
      } else {
        node[known] = splitList(value);
      }
      continue;
    }
    const item = LIST_ITEM_RE.exec(line);
    if (lastKey === "acceptance" && item) {
      const text = (item[1] ?? "").trim();
      if (text) node.acceptance.push(text);
      continue;
    }
    return;
  }
}

/**
 * Parses one journey (docs/spec/coding-agent-harness.md §9.1.3). Never
 * throws: frontmatter and node problems are collected in `errors` and the
 * nodes are parsed regardless, so a linter reports everything at once.
 */
export function parseJourney(relPath: string, text: string): JourneyParse {
  const errors: JourneyError[] = [];
  const meta = parseFrontmatter(text, errors);
  const lines = maskFencedCode(text.split(/\r?\n/));
  const start = bodyStart(lines);

  const headings: Array<{ index: number; depth: number; title: string }> = [];
  for (let i = start; i < lines.length; i++) {
    const h = parseHeading(lines[i] ?? "");
    if (h) headings.push({ index: i, ...h });
  }

  const h1 = headings.find((h) => h.depth === 1);
  let story: string | undefined;
  if (h1) {
    const paragraph: string[] = [];
    for (let i = h1.index + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.trim() === "") {
        if (paragraph.length) break;
        continue;
      }
      if (line === MASKED_LINE || parseHeading(line)) break;
      paragraph.push(line.trim());
    }
    if (paragraph.length) story = paragraph.join(" ");
  }

  const nodes: JourneyNode[] = [];
  const stack: number[] = [];
  for (const [k, h] of headings.entries()) {
    if (h.depth < 2) continue;
    const node = newNode(h.title, h.depth - 1, h.index + 1);
    while (stack.length) {
      const top = nodes[stack[stack.length - 1] as number];
      if (top && top.level < node.level) break;
      stack.pop();
    }
    const parentIndex = stack[stack.length - 1];
    if (parentIndex !== undefined) {
      node.parent = parentIndex;
      const parent = nodes[parentIndex];
      if (parent) parent.isStory = false;
    }
    const next = headings[k + 1];
    parseFields(node, lines, h.index + 1, next ? next.index : lines.length, errors);
    const inherited =
      parentIndex !== undefined ? nodes[parentIndex]?.effectiveStatus : meta?.status;
    node.effectiveStatus = node.status ?? inherited;
    stack.push(nodes.length);
    nodes.push(node);
  }

  const title = meta?.title ?? h1?.title ?? basename(relPath, ".md");
  return { ...(meta ? { meta } : {}), title, ...(story ? { story } : {}), nodes, errors };
}

/** Journey files: `docs/journeys/*.md` minus the generated index, sorted by file name. */
export function listJourneyFiles(targetDir: string): string[] {
  const dir = join(targetDir, JOURNEYS_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
}

/** Parses every journey without throwing; linters read their `errors`. */
export function readJourneys(targetDir: string): ParsedJourney[] {
  return listJourneyFiles(targetDir).map((file) => {
    const path = `${JOURNEYS_DIR}/${file}`;
    const text = readFileSync(join(targetDir, path), "utf8");
    return { path, file, ...parseJourney(path, text) };
  });
}

/**
 * The journeys the render needs. A journey that does not parse fails the
 * render, like an invalid project skill: `init`, `update` and
 * `lint:generated-fresh` report it.
 */
export function loadJourneys(targetDir: string): ParsedJourney[] {
  const journeys = readJourneys(targetDir);
  const problems = journeys.flatMap((j) =>
    j.errors.map((e) => `  - ${j.path}${e.line !== undefined ? `:${e.line}` : ""}: ${e.message}`),
  );
  if (problems.length) {
    throw new Error(
      `invalid journeys (run \`npx @vaubaan/harness lint --pillar journeys\`):\n${problems.join("\n")}`,
    );
  }
  return journeys;
}
