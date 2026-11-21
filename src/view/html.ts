/**
 * The view (docs/spec/coding-agent-harness.md §10.4): one self-contained page
 * rendered from the context graph. Content lives in the markup; the inline
 * script only switches views, selects cards, pans and zooms, and, in a review
 * session, talks to the local server. No network request, deterministic bytes.
 */
import { createHash } from "node:crypto";
import type { LintIssue } from "../linters/types.js";
import { VIEW_SCRIPT, VIEW_STYLE } from "./assets.js";
import type { AttrValue, ContextGraph, GraphEdge, GraphNode, NodeType } from "./graph.js";

// ------------------------------------------------------------------ session

export interface ThreadMessage {
  author: "human" | "agent";
  body: string;
  at: string;
  changes?: Array<{ path: string; line: number }>;
}

export interface Thread {
  id: string;
  anchor: { nodeId: string; sourcePath: string; line: number };
  status: "open" | "submitted" | "answered" | "resolved";
  batch?: number;
  messages: ThreadMessage[];
}

export interface JournalEntry {
  at: string;
  files: string[];
  errors: number;
  warnings: number;
  note?: string;
}

/** What a review session adds to the view; absent for the static page. */
export interface SessionView {
  id: string;
  /** The graph at the session start, for the differences. */
  base: ContextGraph;
  threads: Thread[];
  journal: JournalEntry[];
  /** Graph revision, bumped on each rebuild. */
  revision: number;
}

export interface RenderOptions {
  session?: SessionView;
  /** Prefix of source links; the static page sits two levels under the repo root. */
  sourcePrefix?: string;
}

// ------------------------------------------------------------------ helpers

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline code spans of a doc line as `<code>`, the rest escaped. */
function md(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? `<code>${esc(part.slice(1, -1))}</code>`
        : esc(part.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")),
    )
    .join("");
}

/** A stable HTML id for a node id. */
export function htmlId(nodeId: string): string {
  return `n-${createHash("sha1").update(nodeId).digest("hex").slice(0, 10)}`;
}

function str(v: AttrValue | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function num(v: AttrValue | undefined): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function arr(v: AttrValue | undefined): string[] {
  return Array.isArray(v) ? v : [];
}
function drift(n: GraphNode): { commits: number; threshold: number } | undefined {
  const d = n.attrs.drift;
  if (d && typeof d === "object" && !Array.isArray(d)) {
    const commits = num(d.commits);
    const threshold = num(d.threshold);
    if (commits !== undefined && threshold !== undefined) return { commits, threshold };
  }
  return undefined;
}

function pill(text: string, tone: "ok" | "warn" | "err" | "acc" | "mut" = "mut"): string {
  return `<span class="pill p-${tone}">${esc(text)}</span>`;
}

function statusPill(status: string | undefined): string {
  if (!status) return "";
  const tone = status === "implemented" ? "ok" : status === "proposed" ? "warn" : "mut";
  return pill(status, tone);
}

function driftPill(n: GraphNode): string {
  const d = drift(n);
  if (!d) return "";
  const tone = d.commits > d.threshold ? "err" : d.commits >= d.threshold * 0.8 ? "warn" : "ok";
  return pill(`drift ${d.commits}/${d.threshold}`, tone);
}

function issuesPill(issues: ReadonlyArray<LintIssue>): string {
  if (issues.length === 0) return "";
  const errors = issues.filter((i) => i.severity === "error").length;
  return errors
    ? pill(`${errors} error${errors > 1 ? "s" : ""}`, "err")
    : pill(`${issues.length} warning${issues.length > 1 ? "s" : ""}`, "warn");
}

const TYPE_LABEL: Record<NodeType, string> = {
  readme: "README",
  spec: "spec",
  section: "section",
  term: "term",
  decision: "decision",
  alternative: "rejected alternative",
  handbook: "handbook",
  "test-plan": "test plan",
  "known-gap": "known gap",
  workflow: "workflow",
  quality: "quality",
  doc: "doc",
  "intent-file": "level-1 intent",
  intent: "intent",
  linter: "linter",
  skill: "skill",
  command: "command",
  "rendered-file": "generated file",
  path: "path",
  glob: "glob",
  lesson: "lesson",
};

class Index {
  readonly byId = new Map<string, GraphNode>();
  readonly out = new Map<string, GraphEdge[]>();
  readonly in = new Map<string, GraphEdge[]>();
  constructor(readonly graph: ContextGraph) {
    for (const n of graph.nodes) this.byId.set(n.id, n);
    for (const e of graph.edges) {
      this.out.set(e.from, [...(this.out.get(e.from) ?? []), e]);
      this.in.set(e.to, [...(this.in.get(e.to) ?? []), e]);
    }
  }
  of(type: NodeType): GraphNode[] {
    return this.graph.nodes.filter((n) => n.type === type);
  }
  outOf(id: string, type?: GraphEdge["type"]): GraphEdge[] {
    return (this.out.get(id) ?? []).filter((e) => !type || e.type === type);
  }
  inOf(id: string, type?: GraphEdge["type"]): GraphEdge[] {
    return (this.in.get(id) ?? []).filter((e) => !type || e.type === type);
  }
}

type DiffState = "add" | "chg" | "del" | undefined;

function signature(n: GraphNode): string {
  return JSON.stringify([n.title, n.attrs, n.issues.map((i) => `${i.linter}|${i.message}`)]);
}

// --------------------------------------------------------------- the canvas
//
// A map, not an inventory: one card per document, grouped by pillar, with
// the links between documents drawn at rest. Terms, code paths, rejected
// alternatives and lint issues are counts on their document's card.
// Selecting a card shows its focus layer: every neighbour, grouped by
// relation, next to the card; the rest of the map fades.

const MAP_TYPES: ReadonlyArray<NodeType> = [
  "readme",
  "spec",
  "decision",
  "handbook",
  "test-plan",
  "workflow",
  "quality",
  "doc",
  "intent-file",
];
const HARNESS_LINTERS = "harness:linters";
const HARNESS_SKILLS = "harness:skills";

const CARD_W = 214;
const CARD_H = 100;
const GAP = 10;
const FRAME_PAD = 14;
const FRAME_HEAD = 30;
const FRAME_GAP = 30;
const ITEM_W = 196;
const ITEM_H = 34;
const ITEM_GAP = 6;
const BLOCK_ROWS = 10;
const FOCUS_ROW_W = 1100;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The map card a node belongs to: itself, its document, or a harness card. */
function mapOf(ix: Index, id: string): string | undefined {
  let n = ix.byId.get(id);
  while (n) {
    if (MAP_TYPES.includes(n.type)) return n.id;
    if (n.type === "linter") return HARNESS_LINTERS;
    if (n.type === "skill" || n.type === "command") return HARNESS_SKILLS;
    n = n.parent ? ix.byId.get(n.parent) : undefined;
  }
  return undefined;
}

/** A document and everything that belongs to it. */
function familyOf(ix: Index, docId: string): GraphNode[] {
  return ix.graph.nodes.filter(
    (n) => n.id === docId || (n.id !== docId && mapOf(ix, n.id) === docId),
  );
}

function worstDiff(states: DiffState[]): DiffState {
  if (states.includes("del")) return states.every((s) => s === "del") ? "del" : "chg";
  if (states.includes("add")) return states.every((s) => s === "add") ? "add" : "chg";
  return states.includes("chg") ? "chg" : undefined;
}

interface MapFrame {
  title: string;
  domain: "project" | "harness";
  cards: GraphNode[];
}

function mapFrames(ix: Index, removed: GraphNode[]): MapFrame[] {
  const all = [...ix.graph.nodes, ...removed.filter((n) => MAP_TYPES.includes(n.type))];
  const pick = (types: NodeType[]) => all.filter((n) => types.includes(n.type));
  return [
    { title: "Intents", domain: "project" as const, cards: pick(["intent-file"]) },
    { title: "README & spec", domain: "project" as const, cards: pick(["readme", "spec"]) },
    { title: "Decisions", domain: "project" as const, cards: pick(["decision"]) },
    { title: "Handbook", domain: "project" as const, cards: pick(["handbook"]) },
    {
      title: "Tests, workflow, quality",
      domain: "project" as const,
      cards: pick(["test-plan", "workflow", "quality"]),
    },
    { title: "Other docs", domain: "project" as const, cards: pick(["doc"]) },
  ].filter((f) => f.cards.length > 0);
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The summary of a document card: counts of what belongs to it. */
function mapCardBody(n: GraphNode, ix: Index, family: GraphNode[]): string {
  const of = (t: NodeType) => family.filter((m) => m.type === t);
  const sub: string[] = [];
  const pills: string[] = [];
  switch (n.type) {
    case "intent-file": {
      const terminals = of("intent").filter((m) => m.attrs.terminal === true);
      const proposed = terminals.filter((m) => m.attrs.effectiveStatus === "proposed").length;
      const done = num(n.attrs.done) ?? 0;
      const total = num(n.attrs.total) ?? terminals.length;
      sub.push(`${done}/${total} delivered`);
      if (proposed) pills.push(pill(`${proposed} proposed`, "warn"));
      pills.push(
        total
          ? `<span class="bar" title="${done}/${total}"><i style="width:${Math.round((done / total) * 100)}%"></i></span>`
          : "",
      );
      break;
    }
    case "spec":
      sub.push(`${count(of("term").length, "term")} · ${count(of("section").length, "section")}`);
      break;
    case "decision": {
      const refs = ix.inOf(n.id, "links-to").length;
      sub.push(count(of("alternative").length, "alternative"));
      pills.push(pill(`cited ×${refs}`, refs <= 1 ? "warn" : "mut"));
      break;
    }
    case "handbook":
    case "test-plan":
    case "workflow": {
      const gaps = of("known-gap").length;
      sub.push(
        `tracks ${count(ix.outOf(n.id, "tracks").length, "path")}${gaps ? ` · ${count(gaps, "known gap")}` : ""}`,
      );
      pills.push(driftPill(n));
      break;
    }
    default:
      sub.push(n.sourcePath);
  }
  pills.push(issuesPill(family.flatMap((m) => m.issues)));
  return `<span class="k">${esc(TYPE_LABEL[n.type])}</span><span class="t">${md(n.title)}</span><span class="s">${esc(sub.join(" · "))}</span><span class="row">${pills.join("")}</span>`;
}

interface FocusGroup {
  label: string;
  items: Array<{ node: GraphNode; note?: string; indent?: number }>;
}

/** The neighbours of a document, grouped by relation. */
function focusGroups(ix: Index, doc: GraphNode, family: GraphNode[]): FocusGroup[] {
  const inFamily = new Set(family.map((n) => n.id));
  const groups = new Map<
    string,
    Map<string, { node: GraphNode; note?: string; indent?: number }>
  >();
  const add = (label: string, node: GraphNode | undefined, note?: string, indent?: number) => {
    if (!node || node.id === doc.id) return;
    const g = groups.get(label) ?? new Map();
    if (!g.has(node.id))
      g.set(node.id, {
        node,
        ...(note ? { note } : {}),
        ...(indent !== undefined ? { indent } : {}),
      });
    groups.set(label, g);
  };
  /** A neighbour inside another document is shown as that document; terms, and intents using words, stay themselves. */
  const other = (id: string, keepIntent = false) => {
    const n = ix.byId.get(id);
    if (!n) return undefined;
    if (n.type === "term" || (keepIntent && n.type === "intent")) return n;
    const m = mapOf(ix, id);
    return m && m !== HARNESS_LINTERS && m !== HARNESS_SKILLS ? ix.byId.get(m) : n;
  };
  // What belongs to the document.
  const contents: Record<string, NodeType> = {
    "intent-file": "intent",
    spec: "term",
    decision: "alternative",
    "test-plan": "known-gap",
  };
  const child = contents[doc.type];
  if (child) {
    const label = {
      intent: "Intents",
      term: "Vocabulary",
      alternative: "Rejected alternatives",
      "known-gap": "Known gaps",
    }[child as "intent"];
    for (const n of family.filter((m) => m.type === child).sort((a, b) => a.line - b.line)) {
      add(
        label,
        n,
        n.type === "intent" && n.attrs.terminal === true ? str(n.attrs.effectiveStatus) : undefined,
        n.type === "intent" ? (num(n.attrs.level) ?? 1) - 1 : undefined,
      );
    }
  }
  for (const m of family) {
    for (const e of ix.outOf(m.id)) {
      if (inFamily.has(e.to) || e.type === "contains") continue;
      const label = {
        "links-to": "Cites",
        spec: "Cites",
        tracks: "Tracks",
        anchors: "Code anchors",
        requires: "Uses words",
        creates: "Uses words",
      }[e.type as "spec"];
      if (label)
        add(
          label,
          other(e.to),
          e.type === "creates" ? "creates" : e.type === "requires" ? "requires" : undefined,
        );
    }
    for (const e of ix.inOf(m.id)) {
      if (inFamily.has(e.from) || e.type === "contains") continue;
      const label = {
        "links-to": "Cited by",
        spec: "Cited by",
        requires: "Words used by",
        creates: "Words used by",
        checks: "Checked by",
      }[e.type as "spec"];
      if (label)
        add(
          label,
          other(e.from, e.type === "requires" || e.type === "creates"),
          e.type === "creates" ? "creates" : e.type === "requires" ? "requires" : undefined,
        );
    }
  }
  const order = [
    "Intents",
    "Vocabulary",
    "Rejected alternatives",
    "Known gaps",
    "Cites",
    "Cited by",
    "Uses words",
    "Words used by",
    "Tracks",
    "Code anchors",
    "Checked by",
  ];
  return order
    .filter((l) => groups.has(l))
    .map((label) => ({ label, items: [...(groups.get(label)?.values() ?? [])] }));
}

function focusItem(
  it: { node: GraphNode; note?: string; indent?: number },
  x: number,
  y: number,
  diff: Map<string, DiffState>,
  ix: Index,
): string {
  const n = it.node;
  const isDoc = MAP_TYPES.includes(n.type);
  const cls = ["fi", `t-${n.type}`, `d-${n.domain}`];
  const state = isDoc ? worstDiff(familyOf(ix, n.id).map((m) => diff.get(m.id))) : diff.get(n.id);
  if (state) cls.push(`is-${state}`);
  if (
    n.issues.some((i) => i.severity === "error") ||
    n.attrs.exists === false ||
    n.attrs.defined === false
  )
    cls.push("has-err");
  const indent = (it.indent ?? 0) * 12;
  const tone = it.note === "implemented" ? "ok" : it.note === "proposed" ? "warn" : "mut";
  return `<a class="${cls.join(" ")}" href="#${htmlId(n.id)}" data-n="${htmlId(n.id)}"${isDoc ? ' data-doc="1"' : ""} style="left:${x + indent}px;top:${y}px;width:${ITEM_W - indent}px"><span class="t">${md(n.title)}</span>${it.note === "implemented" || it.note === "proposed" ? `<i class="dot ${tone}" title="${esc(it.note)}"></i>` : it.note ? `<span class="k">${esc(it.note)}</span>` : `<span class="k">${esc(TYPE_LABEL[n.type])}</span>`}</a>`;
}

function renderFocus(
  ix: Index,
  doc: GraphNode,
  at: Box,
  family: GraphNode[],
  diff: Map<string, DiffState>,
): { html: string; box: Box } {
  const groups = focusGroups(ix, doc, family);
  const parts: string[] = [];
  const lines: string[] = [];
  const x0 = at.x + at.w + 90;
  let x = x0;
  let top = at.y - 20;
  let rowH = 0;
  let right = x0;
  let bottom = at.y + at.h;
  for (const g of groups) {
    const cols = Math.ceil(g.items.length / BLOCK_ROWS);
    const rows = Math.min(BLOCK_ROWS, g.items.length);
    const w = cols * (ITEM_W + ITEM_GAP) - ITEM_GAP + 2 * 10;
    const h = 28 + rows * (ITEM_H + ITEM_GAP) + 6;
    if (x > x0 && x + w > x0 + FOCUS_ROW_W) {
      x = x0;
      top += rowH + 24;
      rowH = 0;
    }
    parts.push(
      `<div class="fb" style="left:${x}px;top:${top}px;width:${w}px;height:${h}px"><span class="fbt">${esc(g.label)} <i>${g.items.length}</i></span></div>`,
    );
    g.items.forEach((it, i) => {
      const col = Math.floor(i / BLOCK_ROWS);
      const row = i % BLOCK_ROWS;
      parts.push(
        focusItem(
          it,
          x + 10 + col * (ITEM_W + ITEM_GAP),
          top + 28 + row * (ITEM_H + ITEM_GAP),
          diff,
          ix,
        ),
      );
    });
    const x1 = at.x + at.w;
    const y1 = at.y + at.h / 2;
    const y2 = top + 14;
    lines.push(`<path d="M${x1} ${y1} C${x1 + 50} ${y1},${x - 50} ${y2},${x} ${y2}"/>`);
    rowH = Math.max(rowH, h);
    right = Math.max(right, x + w);
    bottom = Math.max(bottom, top + h);
    x += w + 24;
  }
  const start = at.y - 20;
  const box = {
    x: at.x - 20,
    y: Math.min(start, at.y) - 20,
    w: right - at.x + 40,
    h: bottom - start + 40,
  };
  const empty = groups.length
    ? ""
    : `<div class="fb fb-empty" style="left:${at.x + at.w + 90}px;top:${at.y}px;width:220px;height:${at.h}px"><span class="fbt">Linked to nothing</span></div>`;
  return {
    html: `<div class="focus" data-for="${htmlId(doc.id)}" data-box="${box.x},${box.y},${box.w},${box.h}"><svg class="fl" aria-hidden="true">${lines.join("")}</svg>${parts.join("")}${empty}</div>`,
    box,
  };
}

function renderCanvas(ix: Index, diff: Map<string, DiffState>, removed: GraphNode[]): string {
  const placed = new Map<string, Box>();
  const frameHtml: string[] = [];
  const cards: string[] = [];
  const focus: string[] = [];
  const families = new Map<string, GraphNode[]>();
  const famOf = (n: GraphNode) => {
    const f = families.get(n.id) ?? (ix.byId.has(n.id) ? familyOf(ix, n.id) : [n]);
    families.set(n.id, f);
    return f;
  };
  type Item = { id: string; html: (b: Box) => string };
  const specs: Array<{ title: string; domain: string; items: Item[] }> = mapFrames(ix, removed).map(
    (f) => ({
      title: f.title,
      domain: f.domain,
      items: f.cards.map((n) => ({
        id: n.id,
        html: (b: Box) => {
          const family = famOf(n);
          const state = worstDiff(family.map((m) => diff.get(m.id)));
          const cls = ["n", `t-${n.type}`, `d-${n.domain}`];
          if (state) cls.push(`is-${state}`);
          if (family.some((m) => m.issues.some((i) => i.severity === "error"))) cls.push("has-err");
          const tag = state
            ? `<span class="diff-tag">${state === "add" ? "added" : state === "chg" ? "changed" : "removed"}</span>`
            : "";
          const q = family
            .map((m) => m.title)
            .join(" ")
            .toLowerCase();
          if (ix.byId.has(n.id)) focus.push(renderFocus(ix, n, b, family, diff).html);
          return `<a class="${cls.join(" ")}" id="c-${htmlId(n.id).slice(2)}" href="#${htmlId(n.id)}" data-n="${htmlId(n.id)}" data-q="${esc(`${q} ${n.sourcePath}`.toLowerCase())}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">${tag}${mapCardBody(n, ix, family)}</a>`;
        },
      })),
    }),
  );
  // The harness: two cards that open their views.
  const linters = ix.of("linter");
  const skills = ix.of("skill");
  const lintIssues = linters.reduce((s, l) => s + (num(l.attrs.issues) ?? 0), 0);
  specs.push({
    title: "Harness",
    domain: "harness",
    items: [
      {
        id: HARNESS_LINTERS,
        html: (b) =>
          `<a class="n t-harness d-harness" href="#view-linters" data-tab="linters" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"><span class="k">harness</span><span class="t">Linters</span><span class="s">${esc(count(linters.length, "linter"))}</span><span class="row">${pill(`${lintIssues} issues`, lintIssues ? "err" : "ok")}</span></a>`,
      },
      {
        id: HARNESS_SKILLS,
        html: (b) =>
          `<a class="n t-harness d-harness" href="#view-skills" data-tab="skills" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"><span class="k">harness</span><span class="t">Skills</span><span class="s">${esc(`${count(skills.length, "skill")} · ${count(ix.of("command").length, "command")}`)}</span><span class="row"></span></a>`,
      },
    ],
  });
  // Shelf packing of the frames; the layout that is read at the highest zoom
  // on a 16:10 screen wins. Deterministic: candidates in a fixed order.
  const layout = (shelfW: number, ratio: number) => {
    let x = 20;
    let y = 20;
    let shelfH = 0;
    let maxX = 0;
    const frames = specs.map((f) => {
      const n = f.items.length;
      const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt(n * ratio))));
      const rows = Math.ceil(n / cols);
      const w = 2 * FRAME_PAD + cols * CARD_W + (cols - 1) * GAP;
      const h = FRAME_HEAD + FRAME_PAD + rows * CARD_H + (rows - 1) * GAP;
      if (x > 20 && x + w > shelfW) {
        x = 20;
        y += shelfH + FRAME_GAP;
        shelfH = 0;
      }
      const at = { x, y, w, h, cols };
      x += w + FRAME_GAP;
      shelfH = Math.max(shelfH, h);
      maxX = Math.max(maxX, at.x + w);
      return at;
    });
    const W = maxX + 40;
    const H = y + shelfH + 40;
    return { frames, W, H, scale: Math.min(1440 / W, 860 / H) };
  };
  let best = layout(1640, 1.6);
  for (let r = 2; r <= 20; r++) {
    const ratio = r / 4;
    for (let shelfW = 1000; shelfW <= 3600; shelfW += 50) {
      const l = layout(shelfW, ratio);
      if (l.scale > best.scale + 1e-9) best = l;
    }
  }
  specs.forEach((f, k) => {
    const at = best.frames[k];
    if (!at) return;
    frameHtml.push(
      `<div class="frame f-${f.domain}" style="left:${at.x}px;top:${at.y}px;width:${at.w}px;height:${at.h}px"><span class="ft">${esc(f.title)} <i>${f.items.length}</i></span></div>`,
    );
    f.items.forEach((it, i) => {
      const b = {
        x: at.x + FRAME_PAD + (i % at.cols) * (CARD_W + GAP),
        y: at.y + FRAME_HEAD + Math.floor(i / at.cols) * (CARD_H + GAP),
        w: CARD_W,
        h: CARD_H,
      };
      placed.set(it.id, b);
      cards.push(it.html(b));
    });
  });
  const worldW = best.W;
  const worldH = best.H;
  // Links between documents, one line per pair, at rest.
  const pairs = new Map<string, { a: string; b: string; n: number }>();
  for (const e of ix.graph.edges) {
    if (!["links-to", "spec", "requires", "creates", "suggests", "checks"].includes(e.type))
      continue;
    if (e.type === "checks") continue;
    const a = mapOf(ix, e.from);
    const b = mapOf(ix, e.to);
    if (!a || !b || a === b) continue;
    const [p, q] = a < b ? [a, b] : [b, a];
    const key = `${p}\u0000${q}`;
    const cur = pairs.get(key) ?? { a: p, b: q, n: 0 };
    cur.n += 1;
    pairs.set(key, cur);
  }
  const edges: string[] = [];
  for (const { a, b, n } of [...pairs.values()].sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1))) {
    const A = placed.get(a);
    const B = placed.get(b);
    if (!A || !B) continue;
    const ax = A.x + A.w / 2;
    const ay = A.y + A.h / 2;
    const bx = B.x + B.w / 2;
    const by = B.y + B.h / 2;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 - Math.min(80, Math.abs(bx - ax) / 6);
    const ida = a.startsWith("harness:") ? a : htmlId(a);
    const idb = b.startsWith("harness:") ? b : htmlId(b);
    edges.push(
      `<path class="me" data-a="${ida}" data-b="${idb}" stroke-width="${(1 + Math.log2(n)).toFixed(2)}" d="M${ax} ${ay} Q${mx} ${my} ${bx} ${by}"><title>${n} link${n > 1 ? "s" : ""}</title></path>`,
    );
  }
  return `<div class="cv" id="cv" data-view="now" tabindex="0" aria-label="Context map">
<div class="cv-world" id="world" style="width:${worldW}px;height:${worldH}px">
<svg class="edges" width="${worldW}" height="${worldH}" aria-hidden="true">${edges.join("")}</svg>
${frameHtml.join("\n")}
${cards.join("\n")}
<div class="focus-layers">${focus.join("\n")}</div>
</div>
<p class="cv-hint">Select a card to see what it is linked to. Esc or a click on the background returns to the map.</p>
<div class="cv-tools"><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="fit">Fit</button><button type="button" data-zoom="in" aria-label="Zoom in">+</button></div>
</div>`;
}

// ------------------------------------------------------------ detail panels

function sourceLink(n: GraphNode, prefix: string): string {
  if (n.domain === "harness" || !n.sourcePath || n.type === "glob")
    return `<span class="mono">${esc(n.sourcePath)}</span>`;
  const where = n.line > 0 ? `${n.sourcePath}:${n.line}` : n.sourcePath;
  return `<a class="mono src" href="${esc(prefix + n.sourcePath)}">${esc(where)}</a>`;
}

function nodeRef(ix: Index, id: string): string {
  const n = ix.byId.get(id);
  if (!n) return esc(id);
  return `<a href="#${htmlId(id)}" data-n="${htmlId(id)}">${md(n.title)}</a> <span class="k">${esc(TYPE_LABEL[n.type])}</span>`;
}

function attrRows(n: GraphNode): string {
  const rows: string[] = [];
  const add = (k: string, v: string) => rows.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`);
  const a = n.attrs;
  if (str(a.lede) && !str(a.statement)) add("Says", md(str(a.lede) ?? ""));
  if (str(a.statement)) add("Statement", md(str(a.statement) ?? ""));
  if (str(a.definition)) add("Definition", md(str(a.definition) ?? ""));
  if (str(a.decision)) add("Decision", md(str(a.decision) ?? ""));
  if (str(a.text) && n.type !== "known-gap") add("Text", md(str(a.text) ?? ""));
  if (str(a.description)) add("Description", md(str(a.description) ?? ""));
  if (str(a.status) || str(a.effectiveStatus))
    add("Status", statusPill(str(a.status) ?? str(a.effectiveStatus)));
  if (arr(a.actors).length) add("Actors", esc(arr(a.actors).join(", ")));
  const d = drift(n);
  if (d) add("Drift", `${driftPill(n)} commits on the tracked files since this doc's last commit`);
  if (str(a.lastReviewed)) add("Reviewed", esc(str(a.lastReviewed) ?? ""));
  const acc = arr(a.acceptance);
  if (acc.length) add("Acceptance", `<ul>${acc.map((c) => `<li>${md(c)}</li>`).join("")}</ul>`);
  if (arr(a.missingSections).length) add("Missing", esc(arr(a.missingSections).join(", ")));
  if (arr(a.pillars).length) add("Pillars", esc(arr(a.pillars).join(", ")));
  if (str(a.severity)) add("Severity", esc(str(a.severity) ?? ""));
  if (str(a.layer))
    add(
      "Layer",
      esc(`${str(a.layer)}${str(a.replaces) ? ` (replaces the ${str(a.replaces)} one)` : ""}`),
    );
  if (arr(a.tags).length) add("Tags", esc(arr(a.tags).join(", ")));
  if (arr(a.requires).length) add("Needs", esc(arr(a.requires).join(", ")));
  if (num(a.lines)) add("Lines", String(num(a.lines)));
  if (typeof a.exists === "boolean")
    add("Exists", a.exists ? pill("yes", "ok") : pill("no", "err"));
  if (num(a.matches) !== undefined) add("Matches", `${num(a.matches)} files`);
  if (str(a.engine)) add("Engine", esc(str(a.engine) ?? ""));
  if (str(a.pillar)) add("Goes to", esc(str(a.pillar) ?? ""));
  if (arr(a.evidence).length)
    add(
      "Evidence",
      `<ul>${arr(a.evidence)
        .map((e) => `<li>${md(e)}</li>`)
        .join("")}</ul>`,
    );
  return rows.length ? `<dl>${rows.join("")}</dl>` : "";
}

function edgeList(ix: Index, n: GraphNode): string {
  const groups = new Map<string, string[]>();
  const push = (label: string, item: string) =>
    groups.set(label, [...(groups.get(label) ?? []), item]);
  const OUT: Record<string, string> = {
    tracks: "Tracks",
    anchors: "Anchored in",
    requires: "Requires",
    creates: "Creates",
    spec: "Spec",
    "links-to": "Links to",
    "gap-of": "Gap of",
    checks: "Checks",
    suggests: "Suggests",
    invokes: "Invokes",
    "renders-to": "Rendered to",
    contains: "Contains",
  };
  const IN: Record<string, string> = {
    tracks: "Tracked by",
    anchors: "Anchor of",
    requires: "Required by",
    creates: "Created by",
    spec: "Spec of",
    "links-to": "Cited by",
    "gap-of": "Known gaps",
    checks: "Checked by",
    suggests: "Suggested by",
    invokes: "Command",
    "renders-to": "Rendered from",
    contains: "Part of",
  };
  for (const e of ix.outOf(n.id)) push(OUT[e.type] ?? e.type, nodeRef(ix, e.to));
  for (const e of ix.inOf(n.id)) push(IN[e.type] ?? e.type, nodeRef(ix, e.from));
  if (!groups.size) return "";
  return `<dl class="rel">${[...groups.entries()]
    .map(
      ([k, items]) =>
        `<dt>${esc(k)} <span class="k">${items.length}</span></dt><dd><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul></dd>`,
    )
    .join("")}</dl>`;
}

function issueList(issues: ReadonlyArray<LintIssue>): string {
  if (!issues.length) return "";
  return `<ul class="issues">${issues
    .map(
      (i) =>
        `<li class="sev-${i.severity}">${pill(i.severity, i.severity === "error" ? "err" : "warn")} <span class="mono">${esc(i.linter)}</span>${i.line !== undefined ? ` <span class="k">line ${i.line}</span>` : ""}<br>${esc(i.message)}</li>`,
    )
    .join("")}</ul>`;
}

function threadHtml(t: Thread, ix: Index): string {
  return `<article class="thread st-${t.status}" id="t-${esc(t.id)}"><header>${pill(t.status, t.status === "answered" ? "acc" : t.status === "resolved" ? "ok" : t.status === "submitted" ? "warn" : "mut")} <span class="k">${esc(t.id)}</span> ${nodeRef(ix, t.anchor.nodeId)}</header>${t.messages
    .map(
      (m) =>
        `<div class="msg m-${m.author}"><span class="who">${m.author === "human" ? "you" : "agent"}</span><p>${esc(m.body)}</p>${(m.changes ?? []).map((c) => `<span class="mono chg">${esc(`${c.path}:${c.line}`)}</span>`).join(" ")}</div>`,
    )
    .join("")}${
    t.status === "answered" || t.status === "open"
      ? `<form class="reply" data-thread="${esc(t.id)}"><label class="sr" for="r-${esc(t.id)}">Reply</label><textarea id="r-${esc(t.id)}" rows="2" placeholder="Reply"></textarea><div class="btns"><button type="submit">Reply</button>${t.status === "answered" ? `<button type="button" data-resolve="${esc(t.id)}">Resolve</button>` : ""}</div></form>`
      : ""
  }</article>`;
}

function renderDetails(
  ix: Index,
  prefix: string,
  removed: GraphNode[],
  session?: SessionView,
): string {
  const threadsOf = new Map<string, Thread[]>();
  for (const t of session?.threads ?? [])
    threadsOf.set(t.anchor.nodeId, [...(threadsOf.get(t.anchor.nodeId) ?? []), t]);
  const all = [...ix.graph.nodes, ...removed];
  return all
    .map((n) => {
      const domainLabel =
        n.domain === "harness" ? "harness (read-only: change it upstream)" : n.domain;
      const threads = threadsOf.get(n.id) ?? [];
      const comment = session
        ? `<section class="comments"><h4>Comments</h4>${threads.map((t) => threadHtml(t, ix)).join("")}<form class="comment" data-node="${esc(n.id)}"><label class="sr" for="cm-${htmlId(n.id)}">Comment on this card</label><textarea id="cm-${htmlId(n.id)}" rows="3" placeholder="${n.domain === "harness" ? "Comment: the agent drafts an upstream issue" : "Comment: the agent changes the source"}"></textarea><button type="submit">Add comment</button></form></section>`
        : "";
      return `<article class="detail" id="${htmlId(n.id)}" data-node="${esc(n.id)}"${(() => {
        const m = mapOf(ix, n.id);
        return m && !m.startsWith("harness:") ? ` data-map="${htmlId(m)}"` : "";
      })()}><header><span class="k">${esc(TYPE_LABEL[n.type])} · ${esc(domainLabel)}</span><h3>${md(n.title)}</h3>${sourceLink(n, prefix)}</header>${issueList(n.issues)}${attrRows(n)}${edgeList(ix, n)}${comment}</article>`;
    })
    .join("\n");
}

// ------------------------------------------------------------------- views

function overview(ix: Index): string {
  const g = ix.graph;
  const terminals = ix.of("intent").filter((n) => n.attrs.terminal === true);
  const delivered = terminals.filter((n) => n.attrs.effectiveStatus === "implemented").length;
  const proposed = terminals.filter((n) => n.attrs.effectiveStatus === "proposed");
  const tracked = g.nodes.filter((n) => drift(n));
  const maxDrift = tracked.reduce((m, n) => Math.max(m, drift(n)?.commits ?? 0), 0);
  const decisions = ix.of("decision");
  const orphans = decisions.filter((d) => ix.inOf(d.id, "links-to").length === 0).length;
  const unresolved = g.nodes.filter(
    (n) => (n.type === "path" || n.type === "glob") && n.attrs.exists === false,
  ).length;
  const tile = (label: string, value: string, sub: string, tone = "") =>
    `<div class="tile ${tone}"><span class="tl">${esc(label)}</span><span class="tv">${esc(value)}</span><span class="ts">${esc(sub)}</span></div>`;
  const review = [...tracked]
    .sort((a, b) => {
      const ra = (drift(a)?.commits ?? 0) / (drift(a)?.threshold ?? 1);
      const rb = (drift(b)?.commits ?? 0) / (drift(b)?.threshold ?? 1);
      return rb - ra || (a.id < b.id ? -1 : 1);
    })
    .slice(0, 6);
  return `<section class="view" id="view-overview" data-title="Overview"><h2>State of the context</h2>
<div class="tiles">
${tile("Lint", g.lint.ran ? `${g.lint.errors} · ${g.lint.warnings}` : "not run", "errors · warnings", g.lint.errors ? "bad" : "")}
${tile("Intents", `${delivered}/${terminals.length}`, `terminal intents delivered, ${proposed.length} proposed`)}
${tile("Tracked docs", String(tracked.length), `highest drift ${maxDrift} commits`)}
${tile("Decisions", String(decisions.length), `${orphans} cited by no doc`, orphans ? "warn" : "")}
${tile("Pointers", String(ix.of("path").length + ix.of("glob").length), `${unresolved} do not resolve`, unresolved ? "bad" : "")}
</div>
<div class="cols"><div class="panel"><h3>Review first</h3><p class="k">Tracked docs closest to their drift threshold.</p><ul class="list">${review
    .map((n) => `<li>${driftPill(n)} ${nodeRef(ix, n.id)}</li>`)
    .join("")}</ul></div>
<div class="panel"><h3>Proposed, not delivered</h3><ul class="list">${
    proposed
      .map(
        (n) =>
          `<li>${nodeRef(ix, n.id)} <span class="k">${arr(n.attrs.acceptance).length} criteria</span></li>`,
      )
      .join("") || '<li class="k">Nothing proposed.</li>'
  }</ul></div>
<div class="panel"><h3>Lint</h3>${
    g.lint.ran
      ? g.nodes.some((n) => n.issues.length) || g.lint.unattached.length
        ? `<ul class="list">${g.nodes
            .filter((n) => n.issues.length)
            .map((n) => `<li>${issuesPill(n.issues)} ${nodeRef(ix, n.id)}</li>`)
            .join(
              "",
            )}${g.lint.unattached.map((i) => `<li>${pill(i.severity, "err")} ${esc(`${i.file}: ${i.message}`)}</li>`).join("")}</ul>`
        : '<p class="k">Every linter passes.</p>'
      : '<p class="k">Run without lint (<code>--no-lint</code>).</p>'
  }</div></div></section>`;
}

function intentsView(ix: Index): string {
  const rows: string[] = [];
  const children = new Map<string, GraphNode[]>();
  for (const n of ix.of("intent"))
    children.set(n.parent ?? "", [...(children.get(n.parent ?? "") ?? []), n]);
  for (const list of children.values()) list.sort((a, b) => a.line - b.line);
  const bar = (n: GraphNode) => {
    const done = num(n.attrs.done) ?? 0;
    const total = num(n.attrs.total) ?? 0;
    if (!total) return "";
    return `<span class="bar" title="${done}/${total}"><i style="width:${Math.round((done / total) * 100)}%"></i></span><span class="mono k">${done}/${total}</span>`;
  };
  const walk = (id: string, depth: number) => {
    for (const n of children.get(id) ?? []) {
      const status = str(n.attrs.effectiveStatus);
      const terminal = n.attrs.terminal === true;
      const acc = arr(n.attrs.acceptance);
      rows.push(
        `<li class="tr l${depth}${terminal && status === "proposed" ? " pr" : ""}" style="--d:${depth}"><span class="ttl">${nodeRef(ix, n.id)}</span>${terminal ? statusPill(status) : bar(n)}${acc.length ? `<ul class="acc">${acc.map((c) => `<li>${md(c)}</li>`).join("")}</ul>` : ""}</li>`,
      );
      walk(n.id, depth + 1);
    }
  };
  for (const f of ix.of("intent-file")) {
    rows.push(
      `<li class="tr l0" style="--d:0"><span class="ttl"><b>${nodeRef(ix, f.id)}</b></span>${bar(f)}</li>`,
    );
    walk(f.id, 1);
  }
  return `<section class="view" id="view-intents" data-title="Intents"><h2>Intent tree</h2><p class="k">What the product does, what is left: the share of delivered terminal intents under each node.</p><ul class="tree">${rows.join("")}</ul></section>`;
}

function vocabularyView(ix: Index): string {
  const terms = ix.of("term");
  const cards = terms.map((t) => {
    const req = ix.inOf(t.id, "requires").length;
    const cre = ix.inOf(t.id, "creates").length;
    const tone =
      t.attrs.defined === false
        ? "bad"
        : req > 0 && cre === 0
          ? "warn"
          : req + cre === 0
            ? "dim"
            : "";
    const note =
      t.attrs.defined === false
        ? "used, not in any Vocabulary"
        : req > 0 && cre === 0
          ? "required, created by no intent"
          : req + cre === 0
            ? "defined, used by no intent"
            : "";
    return `<div class="term ${tone}">${nodeRef(ix, t.id)}<span class="k">created by ${cre} · required by ${req}</span>${note ? `<span class="note">${esc(note)}</span>` : ""}</div>`;
  });
  return `<section class="view" id="view-vocabulary" data-title="Vocabulary"><h2>Vocabulary</h2><p class="k">The spec's words, and the intents that create and require them.</p><div class="terms">${cards.join("")}</div></section>`;
}

function decisionsView(ix: Index): string {
  const items = ix.of("decision").map((d) => {
    const alts = ix
      .outOf(d.id, "contains")
      .map((e) => ix.byId.get(e.to))
      .filter((n): n is GraphNode => !!n);
    const refs = ix.inOf(d.id, "links-to").length;
    return `<details class="adr"><summary>${nodeRef(ix, d.id)} ${pill(`cited ×${refs}`, refs <= 1 ? "warn" : "mut")} ${issuesPill(d.issues)}</summary>${str(d.attrs.decision) ? `<p>${md(str(d.attrs.decision) ?? "")}</p>` : ""}${alts
      .map(
        (a) =>
          `<div class="alt"><b>Rejected · ${md(a.title)}</b> ${md(str(a.attrs.text) ?? "")}</div>`,
      )
      .join("")}</details>`;
  });
  return `<section class="view" id="view-decisions" data-title="Decisions"><h2>Decisions in force</h2><p class="k">Why it is done this way, and what was set aside.</p><div class="adrs">${items.join("")}</div></section>`;
}

function lintersView(ix: Index): string {
  const groups = new Map<string, GraphNode[]>();
  for (const l of ix.of("linter")) {
    const key = arr(l.attrs.pillars).join(", ");
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const rows = [...groups.entries()].map(([pillars, list]) => {
    const skills = [...new Set(list.flatMap((l) => arr(l.attrs.suggests)))];
    return `<div class="lr"><span class="lp">${esc(pillars)}</span><span class="lc">${list
      .map(
        (l) =>
          `<a class="lk ${str(l.attrs.severity) === "error" ? "e" : "w"}" href="#${htmlId(l.id)}" data-n="${htmlId(l.id)}">${esc(l.title.replace(/^lint:/, ""))} <i class="${num(l.attrs.issues) ? "bad" : ""}">${num(l.attrs.issues) ?? 0}</i></a>`,
      )
      .join(
        "",
      )}</span><span class="ls${skills.length ? "" : " none"}">${skills.length ? `→ ${esc(skills.join(", "))}` : "no skill suggested"}</span></div>`;
  });
  return `<section class="view" id="view-linters" data-title="Linters"><h2>Linters <span class="k">harness domain</span></h2><p class="k">What is checked, where, with which result, and which skill fixes it. Solid border: error. Dashed: warning. The number is the current issues.</p><div class="lint-map">${rows.join("")}</div></section>`;
}

function skillsView(ix: Index): string {
  const skills = ix.of("skill");
  const layers = ["shipped", "project", "override"].map((l) => {
    const n = skills.filter((s) => s.attrs.layer === l).length;
    return `<span class="ly${n ? " on" : ""}">${esc(l === "shipped" ? "Shipped (harness)" : l === "project" ? "Project docs/skills/" : "Local overrides")} · ${n}</span>`;
  });
  const disabled = skills.filter((s) => s.attrs.disabled).length;
  const engines = ["claude-code", "codex-cli", "opencode"];
  const rows = skills.map((s) => {
    const cmd = ix
      .inOf(s.id, "invokes")
      .map((e) => ix.byId.get(e.from)?.title)
      .filter(Boolean)
      .join(", ");
    const suggestedBy = ix.inOf(s.id, "suggests").length;
    const rendered = ix.outOf(s.id, "renders-to").map((e) => str(ix.byId.get(e.to)?.attrs.engine));
    const cells = engines.map((eng) => {
      const has =
        rendered.includes(eng) ||
        (eng === "opencode" &&
          rendered.length > 0 &&
          ix.graph.nodes.some((n) => n.type === "rendered-file" && n.attrs.engine === "opencode"));
      return `<td class="${has ? "ok" : "no"}">${has ? "✓" : "—"}</td>`;
    });
    return `<tr><td>${nodeRef(ix, s.id)}</td><td class="mono">${esc(cmd || "—")}</td><td>${esc(arr(s.attrs.tags).join(", "))}</td><td class="${suggestedBy ? "" : "warn"}">${suggestedBy ? `${suggestedBy} linter${suggestedBy > 1 ? "s" : ""}` : "none"}</td>${cells.join("")}<td class="num">${num(s.attrs.lines) ?? 0}</td></tr>`;
  });
  return `<section class="view" id="view-skills" data-title="Skills"><h2>Skills</h2><p class="k">What the agent can load, where it comes from, where it is rendered. Lines hint at the context a skill costs when loaded.</p><div class="layers">${layers.join("")}${disabled ? `<span class="ly">Disabled · ${disabled}</span>` : ""}</div><div class="tbl"><table><thead><tr><th>Skill</th><th>Command</th><th>Tags</th><th>Suggested by</th><th>Claude Code</th><th>Codex</th><th>OpenCode</th><th>Lines</th></tr></thead><tbody>${rows.join("")}</tbody></table></div></section>`;
}

function lessonsView(ix: Index): string {
  const lessons = ix.of("lesson");
  if (!lessons.length) return "";
  return `<section class="view" id="view-lessons" data-title="Lessons"><h2>Lessons proposed <span class="k">local</span></h2><p class="k">Patches reviews keep asking for, and the rule that would prevent them. Accept, edit or reject them with <code>/harn-lessons</code>.</p><div class="lessons">${lessons
    .map(
      (l) =>
        `<div class="lesson">${nodeRef(ix, l.id)}<span class="row">${pill(str(l.attrs.status) ?? "proposed", str(l.attrs.status) === "accepted" ? "ok" : str(l.attrs.status) === "rejected" ? "mut" : "acc")}${str(l.attrs.domain) ? pill(str(l.attrs.domain) ?? "", "mut") : ""}${num(l.attrs.seen) ? pill(`seen ${num(l.attrs.seen)}×`, "mut") : ""}${str(l.attrs.pillar) ? `<span class="k">→ ${esc(str(l.attrs.pillar) ?? "")}</span>` : ""}</span></div>`,
    )
    .join("")}</div></section>`;
}

function sessionView(ix: Index, s: SessionView, diff: Map<string, DiffState>): string {
  const count = (state: DiffState) => [...diff.values()].filter((d) => d === state).length;
  const baseIssues = new Set(
    s.base.nodes
      .flatMap((n) => n.issues)
      .concat(s.base.lint.unattached)
      .map((i) => `${i.linter}|${i.file}|${i.message}`),
  );
  const nowIssues = ix.graph.nodes.flatMap((n) => n.issues).concat(ix.graph.lint.unattached);
  const nowKeys = new Set(nowIssues.map((i) => `${i.linter}|${i.file}|${i.message}`));
  const added = nowIssues.filter((i) => !baseIssues.has(`${i.linter}|${i.file}|${i.message}`));
  const gone = s.base.nodes
    .flatMap((n) => n.issues)
    .filter((i) => !nowKeys.has(`${i.linter}|${i.file}|${i.message}`));
  const open = s.threads.filter((t) => t.status === "open").length;
  return `<section class="view" id="view-session" data-title="Session"><h2>Review session <span class="k">${esc(s.id)}</span></h2>
<div class="tiles"><div class="tile"><span class="tl">Cards</span><span class="tv">+${count("add")} ~${count("chg")} −${count("del")}</span><span class="ts">since the session start</span></div><div class="tile ${added.length ? "bad" : ""}"><span class="tl">Lint</span><span class="tv">+${added.length} −${gone.length}</span><span class="ts">issues since the start</span></div><div class="tile"><span class="tl">Comments</span><span class="tv">${s.threads.length}</span><span class="ts">${open} not handed over yet</span></div></div>
<div class="session-actions"><button type="button" data-submit ${open ? "" : "disabled"}>Hand over to the agent (${open})</button><button type="button" data-end>End the review</button></div>
<div class="cols"><div class="panel"><h3>Lint since the start</h3><ul class="list">${added
    .map(
      (i) =>
        `<li>${pill(`+ ${i.severity}`, "err")} <span class="mono">${esc(i.linter)}</span> ${esc(`${i.file}${i.line ? `:${i.line}` : ""}: ${i.message}`)}</li>`,
    )
    .join(
      "",
    )}${gone.map((i) => `<li>${pill(`− ${i.severity}`, "ok")} <span class="mono">${esc(i.linter)}</span> ${esc(`${i.file}: ${i.message}`)}</li>`).join("") || (added.length ? "" : '<li class="k">No change.</li>')}</ul></div>
<div class="panel"><h3>Journal</h3><ol class="journal">${
    [...s.journal]
      .reverse()
      .map(
        (j) =>
          `<li><span class="mono k">${esc(j.at.slice(11, 19))}</span> ${esc(j.files.join(", ") || "—")} ${pill(`${j.errors} · ${j.warnings}`, j.errors ? "err" : "ok")}${j.note ? `<br><em>${esc(j.note)}</em>` : ""}</li>`,
      )
      .join("") || '<li class="k">No change yet.</li>'
  }</ol></div></div>
<h3>Comments</h3><div class="threads">${s.threads.map((t) => threadHtml(t, ix)).join("") || '<p class="k">Select a card, then comment it in the side panel.</p>'}</div></section>`;
}

// -------------------------------------------------------------------- page

function diffOf(
  graph: ContextGraph,
  base: ContextGraph | undefined,
): { diff: Map<string, DiffState>; removed: GraphNode[] } {
  const diff = new Map<string, DiffState>();
  if (!base) return { diff, removed: [] };
  const before = new Map(base.nodes.map((n) => [n.id, n]));
  for (const n of graph.nodes) {
    const b = before.get(n.id);
    if (!b) diff.set(n.id, "add");
    else if (signature(b) !== signature(n)) diff.set(n.id, "chg");
  }
  const now = new Set(graph.nodes.map((n) => n.id));
  const removed = base.nodes.filter((n) => !now.has(n.id) && n.type !== "section");
  for (const n of removed) diff.set(n.id, "del");
  return { diff, removed };
}

export function renderView(graph: ContextGraph, opts: RenderOptions = {}): string {
  const ix = new Index(graph);
  const prefix = opts.sourcePrefix ?? (opts.session ? "/" : "../../");
  const { diff, removed } = diffOf(graph, opts.session?.base);
  const project = ix.of("readme")[0]?.title ?? "Project";
  const views = [
    overview(ix),
    intentsView(ix),
    vocabularyView(ix),
    decisionsView(ix),
    lintersView(ix),
    skillsView(ix),
    lessonsView(ix),
    opts.session ? sessionView(ix, opts.session, diff) : "",
  ].filter(Boolean);
  const tabs = [
    ["canvas", "Canvas"],
    ...views.map((v) => {
      const id = /id="view-([a-z]+)"/.exec(v)?.[1] ?? "";
      const title = /data-title="([^"]+)"/.exec(v)?.[1] ?? id;
      return [id, title];
    }),
  ];
  const lintTone = !graph.lint.ran
    ? "mut"
    : graph.lint.errors
      ? "err"
      : graph.lint.warnings
        ? "warn"
        : "ok";
  const lintText = graph.lint.ran
    ? `lint ${graph.lint.errors} · ${graph.lint.warnings}`
    : "lint not run";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="@vaubaan/harness ${esc(graph.harness)}">
<title>${esc(project)} — context</title>
<style>${VIEW_STYLE}</style>
</head>
<body${opts.session ? ` data-session="${esc(opts.session.id)}" data-revision="${opts.session.revision}"` : ""}>
<header class="top">
<div class="brand"><b>${esc(project)}</b><span class="k">context · harness ${esc(graph.harness)}</span></div>
<nav class="tabs" aria-label="Views">${tabs.map(([id, label]) => `<a href="#view-${id}" data-tab="${id}">${esc(label ?? "")}</a>`).join("")}</nav>
<div class="status"><span id="hs">${pill(lintText, lintTone)}${opts.session ? '<span class="live" title="Live review session"><i></i>live</span>' : ""}</span>${opts.session ? `<span class="seg" role="group" aria-label="Differences"><button type="button" data-diff="before">Before</button><button type="button" data-diff="now" aria-pressed="true">Now</button><button type="button" data-diff="diff">Differences</button></span>` : ""}<label class="sr" for="q">Search</label><input id="q" type="search" placeholder="Search  /" autocomplete="off"></div>
</header>
<main>
<section class="view active" id="view-canvas" data-title="Canvas">${renderCanvas(ix, diff, removed)}</section>
${views.join("\n")}
</main>
<aside class="side" id="side" aria-label="Card details"><button type="button" class="close" data-close aria-label="Close">×</button><p class="k empty">Select a card to see where it comes from and what it is linked to.</p>
${renderDetails(ix, prefix, removed, opts.session)}
</aside>
<script>${VIEW_SCRIPT}</script>
</body>
</html>
`;
}
