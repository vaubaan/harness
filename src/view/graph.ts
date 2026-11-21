/**
 * The context graph (docs/spec/coding-agent-harness.md §10.4): the meta
 * database as one index of nodes and typed edges, built with the readers the
 * linters use and carrying the lint report. Deterministic: an identical tree
 * gives identical bytes.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join, posix, relative } from "node:path";
import fg from "fast-glob";
import { readManifest } from "../cli/manifest.js";
import { defaultPackageDir } from "../cli/plan-render.js";
import { LINKED_DOC_IGNORES, resolveLink } from "../linters/cross-links.js";
import { ALL_LINTERS, loadLintConfig, runLinters } from "../linters/index.js";
import { intentFileSpecs, resolveSpecPath } from "../linters/intent-util.js";
import { driftOf } from "../linters/tracks-drift.js";
import type { LintIssue, LintReport } from "../linters/types.js";
import { parseFrontmatter, trackedPathExists } from "../linters/util.js";
import { loadHarness, loadOverrides, loadProjectSkills } from "../loader.js";
import {
  headingSlug,
  isExternalOrAnchor,
  readAdr,
  readHeadings,
  readKnownGaps,
  readLede,
  readLinks,
  stripFragment,
  vocabularyTerms,
} from "../parser/docs.js";
import { type IntentNode, readIntentFiles } from "../parser/intent.js";
import { VERSION } from "../version.js";

export type Domain = "harness" | "project" | "local";

export const NODE_TYPES = [
  "readme",
  "spec",
  "section",
  "term",
  "decision",
  "alternative",
  "handbook",
  "test-plan",
  "known-gap",
  "workflow",
  "quality",
  "doc",
  "intent-file",
  "intent",
  "linter",
  "skill",
  "command",
  "rendered-file",
  "path",
  "glob",
  "lesson",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type EdgeType =
  | "contains"
  | "tracks"
  | "anchors"
  | "requires"
  | "creates"
  | "spec"
  | "links-to"
  | "gap-of"
  | "checks"
  | "suggests"
  | "invokes"
  | "renders-to";

export type AttrValue = string | number | boolean | null | string[] | { [k: string]: AttrValue };

export interface GraphNode {
  id: string;
  type: NodeType;
  domain: Domain;
  title: string;
  /** Path from the repo root, or the package name for a harness node. */
  sourcePath: string;
  /** 1-based; 0 when the node has no line of its own. */
  line: number;
  parent?: string;
  attrs: Record<string, AttrValue>;
  issues: LintIssue[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  line: number;
}

export interface ContextGraph {
  version: 1;
  harness: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  lint: { ran: boolean; errors: number; warnings: number; unattached: LintIssue[] };
}

export interface BuildOptions {
  /** Run the linters and attach their issues (default true). */
  lint?: boolean;
  /** A report already computed; skips running the linters. */
  report?: LintReport;
  /** Directory holding the shipped `skills/` and `commands/`. */
  packageDir?: string;
}

export const HARNESS_SOURCE = "@vaubaan/harness";
const LESSONS_FILE = ".vaubaan/lessons/lessons.json";

/** The pillar each linter pillar name checks, as a path prefix or file. */
const PILLAR_PATHS: Record<string, ReadonlyArray<string>> = {
  readme: ["README.md"],
  spec: ["docs/spec/"],
  decisions: ["docs/decisions/"],
  handbook: ["docs/handbook/"],
  tests: ["docs/tests/"],
  workflow: ["docs/workflow/"],
  quality: ["docs/quality/"],
  intents: ["docs/intents/"],
};

const RENDERED_SKILL_DIRS = [".claude/skills", ".agents/skills", ".opencode/skills"];
const RENDERED_COMMAND_DIRS = [".claude/commands", ".opencode/commands"];

function docType(path: string): NodeType {
  if (path === "README.md") return "readme";
  if (path.endsWith("/README.md")) return "doc";
  if (path.startsWith("docs/spec/")) return "spec";
  if (path.startsWith("docs/decisions/")) return "decision";
  if (path.startsWith("docs/handbook/")) return "handbook";
  if (path.startsWith("docs/tests/")) return "test-plan";
  if (path.startsWith("docs/workflow/")) return "workflow";
  if (path.startsWith("docs/quality/")) return "quality";
  if (path.startsWith("docs/intents/")) return "intent-file";
  return "doc";
}

function dateString(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value) return value;
  return undefined;
}

function truncate(text: string | undefined, max = 280): string | undefined {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function compact(attrs: Record<string, AttrValue | undefined>): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {};
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) out[k] = v;
  return out;
}

function engineOf(path: string): string | undefined {
  if (path.startsWith(".claude/") || path === "CLAUDE.md") return "claude-code";
  if (path.startsWith(".agents/")) return "codex-cli";
  if (path.startsWith(".opencode/")) return "opencode";
  return undefined;
}

class Builder {
  readonly nodes = new Map<string, GraphNode>();
  readonly edges = new Map<string, GraphEdge>();

  add(
    node: Omit<GraphNode, "issues" | "attrs"> & { attrs?: Record<string, AttrValue | undefined> },
  ) {
    const existing = this.nodes.get(node.id);
    if (existing) return existing;
    const full: GraphNode = { ...node, attrs: compact(node.attrs ?? {}), issues: [] };
    this.nodes.set(node.id, full);
    return full;
  }

  edge(from: string, to: string, type: EdgeType, line: number) {
    if (from === to) return;
    const key = `${from}\u0000${type}\u0000${to}`;
    const existing = this.edges.get(key);
    if (!existing || line < existing.line) this.edges.set(key, { from, to, type, line });
  }

  /** A `tracks:` entry or an anchor, as a path or glob node. */
  target(repoRoot: string, pattern: string): string {
    const isGlob = pattern.includes("*");
    const id = `${isGlob ? "glob" : "path"}:${pattern}`;
    if (!this.nodes.has(id)) {
      const matches = isGlob ? fg.sync(pattern, { cwd: repoRoot }).length : undefined;
      this.add({
        id,
        type: isGlob ? "glob" : "path",
        domain: "project",
        title: pattern,
        sourcePath: pattern,
        line: 0,
        attrs: {
          exists: isGlob ? (matches ?? 0) > 0 : trackedPathExists(repoRoot, pattern),
          matches,
        },
      });
    }
    return id;
  }
}

function intentSlugPath(nodes: ReadonlyArray<IntentNode>, index: number): string {
  const parts: string[] = [];
  let i: number | undefined = index;
  while (i !== undefined) {
    const n: IntentNode | undefined = nodes[i];
    if (!n) break;
    parts.unshift(headingSlug(n.title));
    i = n.parent;
  }
  return parts.join("/");
}

/** The node of a relative doc link: a section when its fragment names one, else the doc. */
function linkTarget(b: Builder, repoRoot: string, from: string, url: string): string | undefined {
  const abs = resolveLink(repoRoot, from, url);
  const rel = relative(repoRoot, abs).split("\\").join("/");
  const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  if (hash && b.nodes.has(`sec:${rel}#${hash}`)) return `sec:${rel}#${hash}`;
  if (b.nodes.has(`doc:${rel}`)) return `doc:${rel}`;
  return undefined;
}

export function buildGraph(repoRoot: string, opts: BuildOptions = {}): ContextGraph {
  const b = new Builder();
  const config = loadLintConfig(repoRoot);
  const manifest = (() => {
    try {
      return readManifest(repoRoot);
    } catch {
      return null;
    }
  })();
  const rendered = new Set(manifest?.files ?? []);

  // ------------------------------------------------------------ doc files
  const docFiles = fg
    .sync(["README.md", "docs/**/*.md"], {
      cwd: repoRoot,
      ignore: [...LINKED_DOC_IGNORES, ...config.ignore],
    })
    .filter((f) => !rendered.has(f))
    .sort();
  const texts = new Map<string, string>();
  for (const path of docFiles) {
    const text = readFileSync(join(repoRoot, path), "utf8");
    texts.set(path, text);
    const { data } = parseFrontmatter(text);
    const h1 = readHeadings(text).find((h) => h.depth === 1);
    const title =
      (typeof data.title === "string" && data.title) || h1?.title || basename(path, ".md");
    const type = docType(path);
    b.add({
      id: `doc:${path}`,
      type,
      domain: "project",
      title,
      sourcePath: path,
      line: 1,
      attrs: {
        lede: truncate(readLede(text)),
        status: typeof data.status === "string" ? data.status : undefined,
        lastReviewed: dateString(data.last_reviewed),
        lines: text.split("\n").length,
      },
    });
  }

  // ----------------------------------------------------- spec: sections, terms
  for (const path of docFiles.filter((p) => docType(p) === "spec")) {
    const text = texts.get(path) ?? "";
    for (const h of readHeadings(text)) {
      if (h.depth < 2 || h.depth > 3) continue;
      b.add({
        id: `sec:${path}#${h.slug}`,
        type: "section",
        domain: "project",
        title: h.title,
        sourcePath: path,
        line: h.line,
        parent: `doc:${path}`,
        attrs: { depth: h.depth },
      });
      b.edge(`doc:${path}`, `sec:${path}#${h.slug}`, "contains", h.line);
    }
    for (const term of vocabularyTerms(text) ?? []) {
      const id = `term:${term.slug}`;
      b.add({
        id,
        type: "term",
        domain: "project",
        title: term.term,
        sourcePath: path,
        line: term.line,
        parent: `doc:${path}`,
        attrs: { defined: true, definition: truncate(term.definition, 400) },
      });
      b.edge(`doc:${path}`, id, "contains", term.line);
    }
  }

  // ------------------------------------------------- decisions: alternatives
  for (const path of docFiles.filter((p) => docType(p) === "decision")) {
    const adr = readAdr(texts.get(path) ?? "");
    const node = b.nodes.get(`doc:${path}`);
    if (node) {
      node.attrs = compact({
        ...node.attrs,
        decision: truncate(adr.decision, 600),
        missingSections: adr.missing.length ? adr.missing : undefined,
      });
    }
    const stem = basename(path, ".md");
    for (const alt of adr.alternatives) {
      const id = `alt:${stem}/${headingSlug(alt.title)}`;
      b.add({
        id,
        type: "alternative",
        domain: "project",
        title: alt.title,
        sourcePath: path,
        line: alt.line,
        parent: `doc:${path}`,
        attrs: { text: truncate(alt.text, 400) },
      });
      b.edge(`doc:${path}`, id, "contains", alt.line);
    }
  }

  // ------------------------------------------- tracked docs: tracks, drift
  for (const path of docFiles) {
    const type = docType(path);
    if (type !== "handbook" && type !== "test-plan" && type !== "workflow") continue;
    const text = texts.get(path) ?? "";
    const { data } = parseFrontmatter(text);
    const lines = text.split("\n");
    if (Array.isArray(data.tracks)) {
      for (const entry of data.tracks) {
        if (typeof entry !== "string") continue;
        const line = lines.findIndex((l) => l.includes(entry)) + 1 || 1;
        b.edge(`doc:${path}`, b.target(repoRoot, entry), "tracks", line);
      }
    }
  }

  // --------------------------------------------------------- known gaps
  for (const path of docFiles.filter((p) => docType(p) === "test-plan")) {
    for (const gap of readKnownGaps(texts.get(path) ?? "")) {
      const id = `gap:${path}:${gap.line}`;
      b.add({
        id,
        type: "known-gap",
        domain: "project",
        title: truncate(gap.text.replace(/⚠️|\*/gu, "").trim(), 120) ?? gap.text,
        sourcePath: path,
        line: gap.line,
        parent: `doc:${path}`,
        attrs: { text: gap.text },
      });
      b.edge(`doc:${path}`, id, "contains", gap.line);
    }
  }

  // -------------------------------------------------------------- intents
  for (const file of readIntentFiles(repoRoot)) {
    const fileId = `doc:${file.path}`;
    const fileNode = b.nodes.get(fileId);
    if (fileNode) {
      fileNode.title = file.title;
      fileNode.attrs = compact({
        ...fileNode.attrs,
        status: file.meta?.status,
        actors: file.meta?.actors ? [...file.meta.actors] : undefined,
        statement: truncate(file.statement, 400),
      });
    }
    const stem = basename(file.path, ".md");
    const ids = file.nodes.map((_, i) => `intent:${stem}/${intentSlugPath(file.nodes, i)}`);
    file.nodes.forEach((n, i) => {
      const id = ids[i] as string;
      const parent = n.parent !== undefined ? (ids[n.parent] as string) : fileId;
      b.add({
        id,
        type: "intent",
        domain: "project",
        title: n.title,
        sourcePath: file.path,
        line: n.line,
        parent,
        attrs: {
          level: n.level,
          terminal: n.isTerminal,
          status: n.status,
          effectiveStatus: n.effectiveStatus,
          acceptance: n.acceptance.length ? [...n.acceptance] : undefined,
        },
      });
      b.edge(parent, id, "contains", n.line);
      for (const entity of n.requires)
        b.edge(id, termId(b, entity, file.path, n.line), "requires", n.line);
      for (const entity of n.creates)
        b.edge(id, termId(b, entity, file.path, n.line), "creates", n.line);
      for (const anchor of n.anchors)
        b.edge(id, b.target(repoRoot, anchor), "anchors", n.fieldLines.anchors ?? n.line);
      if (n.spec) {
        const target = linkTarget(b, repoRoot, file.path, n.spec);
        if (target) b.edge(id, target, "spec", n.fieldLines.spec ?? n.line);
      }
    });
    // Progress of every node: implemented terminal intents under it.
    const progress = (index: number): [number, number] => {
      const n = file.nodes[index];
      if (!n) return [0, 0];
      if (n.isTerminal) return [n.effectiveStatus === "implemented" ? 1 : 0, 1];
      let done = 0;
      let total = 0;
      file.nodes.forEach((c, j) => {
        if (c.parent !== index) return;
        const [d, t] = progress(j);
        done += d;
        total += t;
      });
      return [done, total];
    };
    let fileDone = 0;
    let fileTotal = 0;
    file.nodes.forEach((n, i) => {
      const [done, total] = progress(i);
      const node = b.nodes.get(ids[i] as string);
      if (node) node.attrs = { ...node.attrs, done, total };
      if (n.parent === undefined) {
        fileDone += done;
        fileTotal += total;
      }
    });
    if (fileNode) fileNode.attrs = { ...fileNode.attrs, done: fileDone, total: fileTotal };
    for (const spec of intentFileSpecs(file.meta)) {
      const path = resolveSpecPath(file.path, spec);
      if (b.nodes.has(`doc:${path}`)) b.edge(fileId, `doc:${path}`, "spec", 1);
    }
  }

  // ------------------------------------------------------- links between docs
  for (const path of docFiles) {
    for (const { url, line } of readLinks(texts.get(path) ?? "")) {
      if (isExternalOrAnchor(url) || stripFragment(url) === "") continue;
      const target = linkTarget(b, repoRoot, path, url);
      if (target) b.edge(`doc:${path}`, target, "links-to", line);
    }
  }

  // ----------------------------------------------------- skills and commands
  const packageDir = opts.packageDir ?? defaultPackageDir();
  const shipped = existsSync(join(packageDir, "skills"))
    ? loadHarness(packageDir)
    : { skills: [], cmds: [] };
  const overridesParent = manifest?.overridesDir ? join(repoRoot, manifest.overridesDir) : repoRoot;
  const overrides = loadOverrides(overridesParent);
  const disabled = new Set(overrides?.disable ?? []);
  const skillLayers: Array<
    [ReturnType<typeof loadProjectSkills>, "shipped" | "project" | "override"]
  > = [
    [[...shipped.skills], "shipped"],
    [loadProjectSkills(repoRoot), "project"],
    [[...(overrides?.add?.skills ?? [])], "override"],
  ];
  for (const [skills, layer] of skillLayers) {
    for (const skill of skills) {
      const id = `skill:${skill.meta.id}`;
      const replaced = b.nodes.get(id);
      if (replaced) b.nodes.delete(id);
      const relSource =
        layer === "shipped"
          ? HARNESS_SOURCE
          : relative(repoRoot, skill.sourcePath).split("\\").join("/");
      b.add({
        id,
        type: "skill",
        domain: layer === "shipped" ? "harness" : layer === "project" ? "project" : "local",
        title: skill.meta.id,
        sourcePath: relSource,
        line: layer === "shipped" ? 0 : 1,
        attrs: {
          layer,
          replaces: replaced ? (replaced.attrs.layer as string) : undefined,
          disabled: disabled.has(skill.meta.id) || undefined,
          description: truncate(skill.meta.description, 400),
          tags: skill.meta.tags ? [...skill.meta.tags] : undefined,
          requires: skill.meta.requires ? [...skill.meta.requires] : undefined,
          engines: skill.meta.engines ? [...skill.meta.engines] : undefined,
          lines: skill.body.split("\n").length,
        },
      });
    }
  }
  const cmdLayers: Array<[ReadonlyArray<(typeof shipped.cmds)[number]>, "shipped" | "override"]> = [
    [shipped.cmds, "shipped"],
    [overrides?.add?.cmds ?? [], "override"],
  ];
  const triggerToSkill = new Map<string, string>();
  for (const [cmds, layer] of cmdLayers) {
    for (const cmd of cmds) {
      const id = `cmd:${cmd.meta.id}`;
      b.nodes.delete(id);
      b.add({
        id,
        type: "command",
        domain: layer === "shipped" ? "harness" : "local",
        title: cmd.meta.trigger,
        sourcePath: layer === "shipped" ? HARNESS_SOURCE : relative(repoRoot, cmd.sourcePath),
        line: 0,
        attrs: {
          layer,
          skill: cmd.meta.invokes_skill,
          description: truncate(cmd.meta.description),
        },
      });
      triggerToSkill.set(cmd.meta.trigger, `skill:${cmd.meta.invokes_skill}`);
      b.edge(id, `skill:${cmd.meta.invokes_skill}`, "invokes", 0);
    }
  }

  // ------------------------------------------------------- rendered files
  for (const path of [...rendered].sort()) {
    b.add({
      id: `rendered:${path}`,
      type: "rendered-file",
      domain: "project",
      title: path,
      sourcePath: path,
      line: 1,
      attrs: {
        engine: engineOf(path),
        preserved: manifest?.preservedFiles?.includes(path) || undefined,
      },
    });
    const skillDir = RENDERED_SKILL_DIRS.find((d) => path.startsWith(`${d}/`));
    if (skillDir) {
      const skillId = path.slice(skillDir.length + 1).split("/")[0];
      if (skillId) b.edge(`skill:${skillId}`, `rendered:${path}`, "renders-to", 0);
    }
    const cmdDir = RENDERED_COMMAND_DIRS.find((d) => path.startsWith(`${d}/`));
    if (cmdDir) b.edge(`cmd:${basename(path, ".md")}`, `rendered:${path}`, "renders-to", 0);
  }

  // -------------------------------------------------------------- linters
  for (const linter of ALL_LINTERS) {
    const id = `linter:${linter.id.replace(/^lint:/, "")}`;
    b.add({
      id,
      type: "linter",
      domain: "harness",
      title: linter.id,
      sourcePath: HARNESS_SOURCE,
      line: 0,
      attrs: {
        pillars: [...linter.pillars],
        severity: linter.defaultSeverity,
        suggests: linter.suggestedSkills?.length ? [...linter.suggestedSkills] : undefined,
      },
    });
    for (const trigger of linter.suggestedSkills ?? []) {
      const skill = triggerToSkill.get(trigger);
      if (skill) b.edge(id, skill, "suggests", 0);
    }
    for (const pillar of linter.pillars) {
      for (const prefix of PILLAR_PATHS[pillar] ?? []) {
        for (const path of docFiles) {
          if (path === prefix || (prefix.endsWith("/") && path.startsWith(prefix))) {
            b.edge(id, `doc:${path}`, "checks", 0);
          }
        }
      }
    }
  }

  // --------------------------------------------------------------- lessons
  const lessonsPath = join(repoRoot, LESSONS_FILE);
  if (existsSync(lessonsPath)) {
    try {
      const lessons = JSON.parse(readFileSync(lessonsPath, "utf8")) as unknown;
      if (Array.isArray(lessons)) {
        for (const raw of lessons) {
          if (!raw || typeof raw !== "object") continue;
          const l = raw as Record<string, unknown>;
          if (typeof l.id !== "string" || typeof l.rule !== "string") continue;
          b.add({
            id: `lesson:${l.id}`,
            type: "lesson",
            domain: "local",
            title: l.rule,
            sourcePath: LESSONS_FILE,
            line: 0,
            attrs: JSON.parse(
              JSON.stringify({
                status: typeof l.status === "string" ? l.status : "proposed",
                domain: l.domain,
                pillar: l.pillar,
                seen: typeof l.seen === "number" ? l.seen : undefined,
                evidence: Array.isArray(l.evidence)
                  ? l.evidence.map((e) => (typeof e === "string" ? e : JSON.stringify(e)))
                  : undefined,
              }),
            ) as Record<string, AttrValue>,
          });
        }
      }
    } catch {
      // A broken local file is not the graph's concern.
    }
  }

  // ----------------------------------------------------------------- lint
  const ran = opts.report !== undefined || opts.lint !== false;
  const report = opts.report ?? (opts.lint === false ? undefined : runLinters(repoRoot));
  const unattached: LintIssue[] = [];
  const byFile = new Map<string, GraphNode[]>();
  for (const node of b.nodes.values()) {
    if (node.domain === "harness" || (node.line === 0 && node.type !== "path")) continue;
    const list = byFile.get(node.sourcePath) ?? [];
    list.push(node);
    byFile.set(node.sourcePath, list);
  }
  for (const issue of report?.issues ?? []) {
    const candidates = byFile.get(issue.file) ?? [];
    const fileNode = b.nodes.get(`doc:${issue.file}`) ?? b.nodes.get(`rendered:${issue.file}`);
    let target: GraphNode | undefined;
    if (issue.line !== undefined) {
      for (const n of candidates) {
        if (n.line <= issue.line && (!target || n.line > target.line)) target = n;
      }
    }
    target = target ?? fileNode;
    if (target) target.issues.push(issue);
    else unattached.push(issue);
    const linter = b.nodes.get(`linter:${issue.linter.replace(/^lint:/, "")}`);
    if (linter)
      linter.attrs = { ...linter.attrs, issues: ((linter.attrs.issues as number) ?? 0) + 1 };
  }

  // ----------------------------------------------------------------- drift
  for (const node of b.nodes.values()) {
    if (
      node.type !== "handbook" &&
      node.type !== "test-plan" &&
      node.type !== "workflow" &&
      node.type !== "intent-file"
    )
      continue;
    const drift = driftOf(repoRoot, node.sourcePath);
    if (drift)
      node.attrs = { ...node.attrs, drift: { commits: drift.commits, threshold: drift.threshold } };
  }

  const nodes = [...b.nodes.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const known = new Set(nodes.map((n) => n.id));
  const edges = [...b.edges.values()]
    .filter((e) => known.has(e.from) && known.has(e.to))
    .sort((x, y) =>
      x.from !== y.from
        ? x.from < y.from
          ? -1
          : 1
        : x.type !== y.type
          ? x.type < y.type
            ? -1
            : 1
          : x.to < y.to
            ? -1
            : x.to > y.to
              ? 1
              : 0,
    );
  return {
    version: 1,
    harness: VERSION,
    nodes,
    edges,
    lint: {
      ran,
      errors: report?.summary.errors ?? 0,
      warnings: report?.summary.warnings ?? 0,
      unattached,
    },
  };
}

/** A vocabulary term, or a node marking an entity no spec defines. */
function termId(b: Builder, entity: string, file: string, line: number): string {
  const id = `term:${entity}`;
  if (!b.nodes.has(id)) {
    b.add({
      id,
      type: "term",
      domain: "project",
      title: entity,
      sourcePath: file,
      line,
      attrs: { defined: false },
    });
  }
  return id;
}

/** The graph as written to `.vaubaan/graph.json`. */
export function serializeGraph(graph: ContextGraph): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

export const GRAPH_PATH = posix.join(".vaubaan", "graph.json");
