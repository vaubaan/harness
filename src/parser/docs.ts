/**
 * Readers of the doc pillars shared by the linters and the context graph
 * (docs/spec/coding-agent-harness.md §10.4): a fact the view shows comes from
 * a reader a linter uses, never from a reader of its own.
 */
import { maskFencedCode, parseHeading } from "./intent.js";

export interface Heading {
  depth: number;
  title: string;
  /** 1-based line in the file. */
  line: number;
  /** GitHub-style anchor: `10.4 View and review` gives `104-view-and-review`. */
  slug: string;
}

/** The GitHub-style anchor of a heading. */
export function headingSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** The headings of a Markdown file, fenced code excluded. */
export function readHeadings(text: string): Heading[] {
  const lines = maskFencedCode(text.split(/\r?\n/));
  const out: Heading[] = [];
  for (const [i, line] of lines.entries()) {
    const h = parseHeading(line);
    if (h) out.push({ depth: h.depth, title: h.title, line: i + 1, slug: headingSlug(h.title) });
  }
  return out;
}

// ---------------------------------------------------------------- vocabulary

const VOCABULARY_HEADING = /^#+\s*(\d+(\.\d+)*\.?\s*)?(Vocabulary|Vocabulaire)\b/i;
const TERM = /^\s*[-*]\s+\*\*([^*]+)\*\*\s*(?:[—–:-]+\s*)?(.*)$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}/;

/** `**Generated file**` gives `generated-file`. */
export function entitySlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface VocabularyTerm {
  term: string;
  slug: string;
  line: number;
  /** The rest of the bullet, or the second cell of the row. */
  definition: string;
}

/** A Vocabulary table row: its first cell, without emphasis; `undefined` for a header or a placeholder. */
function tableTerm(line: string, next: string | undefined): [string, string] | undefined {
  const row = TABLE_ROW.exec(line)?.[1];
  if (row === undefined || TABLE_SEPARATOR.test(line)) return undefined;
  // The header row is the one right above the separator.
  if (next !== undefined && TABLE_SEPARATOR.test(next)) return undefined;
  const cells = row.split("|").map((c) => c.trim());
  const cell = (cells[0] ?? "").replace(/[*_`]/g, "").trim();
  if (!cell || /^<.*>$/.test(cell)) return undefined;
  return [cell, cells[1] ?? ""];
}

/**
 * The terms of a spec's Vocabulary section: the bold terms opening a bullet,
 * and the first cell of each table row (the spec template's form), up to the
 * next heading of the same or a higher level. `undefined` when the spec has
 * no Vocabulary section.
 */
export function vocabularyTerms(specText: string): VocabularyTerm[] | undefined {
  const lines = maskFencedCode(specText.split(/\r?\n/));
  let depth: number | undefined;
  let terms: VocabularyTerm[] | undefined;
  for (const [i, line] of lines.entries()) {
    const heading = parseHeading(line);
    if (depth !== undefined) {
      if (heading && heading.depth <= depth) break;
      const bullet = TERM.exec(line);
      const found: [string, string] | undefined = bullet?.[1]
        ? [bullet[1], bullet[2] ?? ""]
        : tableTerm(line, lines[i + 1]);
      if (found) {
        const [term, definition] = found;
        terms?.push({ term: term.trim(), slug: entitySlug(term), line: i + 1, definition });
      }
      continue;
    }
    if (heading && VOCABULARY_HEADING.test(line)) {
      depth = heading.depth;
      terms = [];
    }
  }
  return terms;
}

/** The entity slugs of a spec's Vocabulary section, `undefined` without one. */
export function vocabularyOf(specText: string): Set<string> | undefined {
  const terms = vocabularyTerms(specText);
  return terms ? new Set(terms.map((t) => t.slug)) : undefined;
}

// --------------------------------------------------------------------- links

const LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

function maskCodeSpans(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

export interface DocLink {
  url: string;
  line: number;
}

/** Every Markdown link outside code, with its line. */
export function readLinks(text: string): DocLink[] {
  const lines = maskCodeSpans(text).split("\n");
  const out: DocLink[] = [];
  for (const [i, line] of lines.entries()) {
    LINK_REGEX.lastIndex = 0;
    let match = LINK_REGEX.exec(line);
    while (match !== null) {
      if (match[2]) out.push({ url: match[2], line: i + 1 });
      match = LINK_REGEX.exec(line);
    }
  }
  return out;
}

/** A link that leaves the repository or stays in the same page. */
export function isExternalOrAnchor(url: string): boolean {
  return /^(https?:|mailto:|#)/.test(url);
}

export function stripFragment(url: string): string {
  const i = url.indexOf("#");
  return i < 0 ? url : url.slice(0, i);
}

// ---------------------------------------------------------------------- ADRs

// English headings are canonical; the French ones are still accepted so
// projects written before the switch to English keep passing.
export const ADR_SECTIONS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: "Context", pattern: /^##\s+(Context|Contexte)\b/m },
  { label: "Decision", pattern: /^##\s+(Decision|D[ée]cision)\b/m },
  { label: "Consequences", pattern: /^##\s+(Consequences|Cons[ée]quences)\b/m },
  {
    label: "Rejected alternatives",
    pattern: /^##\s+(Rejected\s+alternatives|Alternatives(\s+rejet[ée]es)?)\b/im,
  },
];

export interface AdrDoc {
  /** Required sections the ADR lacks, by English label. */
  missing: string[];
  /** The first paragraph of the Decision section, on one line. */
  decision?: string;
  /** The `###` headings under Rejected alternatives. */
  alternatives: Array<{ title: string; line: number; text: string }>;
}

export function readAdr(text: string): AdrDoc {
  const missing = ADR_SECTIONS.filter((s) => !s.pattern.test(text)).map((s) => s.label);
  const lines = maskFencedCode(text.split(/\r?\n/));
  const decisionPattern = ADR_SECTIONS[1]?.pattern;
  const alternativesPattern = ADR_SECTIONS[3]?.pattern;
  let section: "decision" | "alternatives" | undefined;
  const paragraph: string[] = [];
  let paragraphDone = false;
  const alternatives: AdrDoc["alternatives"] = [];
  for (const [i, line] of lines.entries()) {
    const heading = parseHeading(line);
    if (heading && heading.depth <= 2) {
      section = decisionPattern?.test(line)
        ? "decision"
        : alternativesPattern?.test(line)
          ? "alternatives"
          : undefined;
      continue;
    }
    if (section === "decision" && !paragraphDone) {
      if (line.trim() === "") {
        if (paragraph.length) paragraphDone = true;
      } else paragraph.push(line.trim());
    }
    if (section === "alternatives") {
      if (heading && heading.depth === 3) {
        alternatives.push({ title: heading.title, line: i + 1, text: "" });
      } else if (line.trim() && alternatives.length) {
        const last = alternatives[alternatives.length - 1];
        if (last) last.text = last.text ? `${last.text} ${line.trim()}` : line.trim();
      }
    }
  }
  return {
    missing,
    ...(paragraph.length ? { decision: paragraph.join(" ") } : {}),
    alternatives,
  };
}

// -------------------------------------------------------------- known gaps

export interface KnownGap {
  line: number;
  text: string;
  links: string[];
}

const KNOWN_GAPS_HEADING = /^#+\s*(\d+(\.\d+)*\.?\s*)?(Known gaps|Lacunes connues|Trous connus)\b/i;

/** The bullets of a test plan's Known gaps section. */
export function readKnownGaps(text: string): KnownGap[] {
  const lines = maskFencedCode(text.split(/\r?\n/));
  let depth: number | undefined;
  const out: KnownGap[] = [];
  for (const [i, line] of lines.entries()) {
    const heading = parseHeading(line);
    if (depth !== undefined) {
      if (heading && heading.depth <= depth) break;
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet?.[1]) {
        out.push({
          line: i + 1,
          text: bullet[1].trim(),
          links: readLinks(line).map((l) => l.url),
        });
      }
      continue;
    }
    if (heading && KNOWN_GAPS_HEADING.test(line)) depth = heading.depth;
  }
  return out;
}

/** The first non-empty paragraph after the H1, on one line. */
export function readLede(text: string): string | undefined {
  const lines = maskFencedCode(text.split(/\r?\n/));
  let afterTitle = false;
  const paragraph: string[] = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  for (const [i, line] of lines.entries()) {
    if (inFrontmatter) {
      if (i > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }
    const heading = parseHeading(line);
    if (!afterTitle) {
      if (heading?.depth === 1) afterTitle = true;
      continue;
    }
    if (heading) break;
    if (line.trim() === "" || line.startsWith(">") || line.startsWith("<!--")) {
      if (paragraph.length) break;
      continue;
    }
    if (line === "\u0000") break;
    paragraph.push(line.trim());
  }
  return paragraph.length ? paragraph.join(" ") : undefined;
}
