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

const CARD_W = 250;
const CARD_H = 78;
const GAP = 12;
const FRAME_PAD = 18;
const FRAME_TOP = 40;
const COL_GAP = 70;

interface Placed {
  node: GraphNode;
  x: number;
  y: number;
  w: number;
  diff: DiffState;
}

interface Frame {
  key: string;
  title: string;
  domain: "project" | "harness";
  nodes: GraphNode[];
  /** Indentation per node, for the intent tree. */
  indent?: (n: GraphNode) => number;
}

function frames(ix: Index, removed: GraphNode[]): Frame[] {
  const all = [...ix.graph.nodes, ...removed];
  const pick = (types: NodeType[]) => all.filter((n) => types.includes(n.type));
  const intents: GraphNode[] = [];
  // Depth-first order of the intent tree, files sorted.
  const children = new Map<string, GraphNode[]>();
  for (const n of all.filter((x) => x.type === "intent")) {
    const p = n.parent ?? "";
    children.set(p, [...(children.get(p) ?? []), n]);
  }
  for (const list of children.values())
    list.sort((a, b) => a.line - b.line || (a.id < b.id ? -1 : 1));
  const walk = (id: string) => {
    for (const c of children.get(id) ?? []) {
      intents.push(c);
      walk(c.id);
    }
  };
  for (const f of pick(["intent-file"])) {
    intents.push(f);
    walk(f.id);
  }
  const level = (n: GraphNode) => (n.type === "intent" ? (num(n.attrs.level) ?? 1) : 0);
  return [
    { key: "intents", title: "Intents", domain: "project", nodes: intents, indent: level },
    {
      key: "spec",
      title: "Spec & vocabulary",
      domain: "project",
      nodes: [...pick(["readme", "spec"]), ...pick(["term"])],
    },
    { key: "decisions", title: "Decisions", domain: "project", nodes: pick(["decision"]) },
    { key: "handbook", title: "Handbook", domain: "project", nodes: pick(["handbook"]) },
    {
      key: "tests",
      title: "Tests, workflow, quality",
      domain: "project",
      nodes: [
        ...pick(["test-plan"]),
        ...pick(["known-gap"]),
        ...pick(["workflow", "quality", "doc"]),
      ],
    },
    { key: "code", title: "Code pointed to", domain: "project", nodes: pick(["path", "glob"]) },
    {
      key: "harness",
      title: "Harness",
      domain: "harness",
      nodes: [...pick(["linter"]), ...pick(["skill"]), ...pick(["command"])],
    },
  ].filter((f) => f.nodes.length > 0) as Frame[];
}

function cardBody(n: GraphNode, ix: Index): string {
  const sub: string[] = [];
  const pills: string[] = [];
  switch (n.type) {
    case "intent-file":
    case "intent": {
      const done = num(n.attrs.done);
      const total = num(n.attrs.total);
      if (n.type === "intent" && n.attrs.terminal !== true && total)
        sub.push(`${done}/${total} delivered`);
      if (n.type === "intent-file" && total)
        sub.push(`${done}/${total} terminal intents delivered`);
      const acceptance = arr(n.attrs.acceptance);
      if (acceptance.length) sub.push(`${acceptance.length} criteria`);
      pills.push(
        statusPill(
          str(n.attrs.status) ?? (n.attrs.terminal ? str(n.attrs.effectiveStatus) : undefined),
        ),
      );
      break;
    }
    case "term": {
      const req = ix.inOf(n.id, "requires").length;
      const cre = ix.inOf(n.id, "creates").length;
      sub.push(`created by ${cre} · required by ${req}`);
      if (n.attrs.defined === false) pills.push(pill("not in the vocabulary", "err"));
      else if (req > 0 && cre === 0) pills.push(pill("created by none", "warn"));
      break;
    }
    case "decision": {
      const refs = ix.inOf(n.id, "links-to").length;
      sub.push(`${ix.outOf(n.id, "contains").length} rejected alternatives`);
      pills.push(pill(`cited ×${refs}`, refs <= 1 ? "warn" : "mut"));
      break;
    }
    case "handbook":
    case "test-plan":
    case "workflow":
      sub.push(
        `tracks ${ix.outOf(n.id, "tracks").length}${str(n.attrs.lastReviewed) ? ` · reviewed ${str(n.attrs.lastReviewed)}` : ""}`,
      );
      pills.push(driftPill(n));
      break;
    case "path":
    case "glob": {
      const by = ix.inOf(n.id).length;
      sub.push(
        `${n.type === "glob" ? `glob · ${num(n.attrs.matches) ?? 0} files · ` : ""}pointed to by ${by}`,
      );
      if (n.attrs.exists === false) pills.push(pill("does not resolve", "err"));
      break;
    }
    case "linter":
      sub.push(arr(n.attrs.pillars).join(", "));
      pills.push(
        pill(str(n.attrs.severity) ?? "", str(n.attrs.severity) === "error" ? "err" : "warn"),
      );
      pills.push(pill(`${num(n.attrs.issues) ?? 0} issues`, num(n.attrs.issues) ? "err" : "ok"));
      break;
    case "skill":
      sub.push(`${str(n.attrs.layer) ?? ""} · ${num(n.attrs.lines) ?? 0} lines`);
      if (n.attrs.disabled) pills.push(pill("disabled", "err"));
      break;
    case "command":
      sub.push(`→ ${str(n.attrs.skill) ?? ""}`);
      break;
    case "known-gap":
      sub.push("known gap");
      pills.push(pill("not tested", "warn"));
      break;
    default:
      sub.push(n.sourcePath);
  }
  pills.push(issuesPill(n.issues));
  return `<span class="t">${md(n.title)}</span><span class="s">${esc(sub.join(" · "))}</span><span class="row">${pills.join("")}</span>`;
}

function renderCanvas(ix: Index, diff: Map<string, DiffState>, removed: GraphNode[]): string {
  const placed = new Map<string, Placed>();
  const frameHtml: string[] = [];
  let x = 20;
  let maxH = 0;
  for (const f of frames(ix, removed)) {
    const inner: string[] = [];
    let y = FRAME_TOP;
    let width = CARD_W;
    for (const n of f.nodes) {
      const indent = f.indent ? f.indent(n) * 18 : 0;
      width = Math.max(width, CARD_W + indent);
      placed.set(n.id, {
        node: n,
        x: x + FRAME_PAD + indent,
        y: y + 60,
        w: CARD_W,
        diff: diff.get(n.id),
      });
      y += CARD_H + GAP;
    }
    const h = y + FRAME_PAD;
    maxH = Math.max(maxH, h);
    frameHtml.push(
      `<div class="frame f-${f.domain}" style="left:${x}px;top:60px;width:${width + 2 * FRAME_PAD}px;height:${h}px"><span class="ft">${esc(f.title)}</span></div>`,
    );
    inner.push("");
    x += width + 2 * FRAME_PAD + COL_GAP;
  }
  const worldW = x;
  const worldH = maxH + 100;
  const cards: string[] = [];
  for (const p of placed.values()) {
    const n = p.node;
    const cls = ["n", `t-${n.type}`, `d-${n.domain}`];
    if (p.diff) cls.push(`is-${p.diff}`);
    if (n.issues.some((i) => i.severity === "error")) cls.push("has-err");
    const tag = p.diff
      ? `<span class="diff-tag">${p.diff === "add" ? "added" : p.diff === "chg" ? "changed" : "removed"}</span>`
      : "";
    cards.push(
      `<a class="${cls.join(" ")}" id="c-${htmlId(n.id).slice(2)}" href="#${htmlId(n.id)}" data-n="${htmlId(n.id)}" data-q="${esc(`${n.title} ${n.sourcePath}`.toLowerCase())}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px">${tag}${cardBody(n, ix)}</a>`,
    );
  }
  const edges: string[] = [];
  for (const e of [...ix.graph.edges].filter((e) => e.type !== "contains")) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    const forward = a.x <= b.x;
    const x1 = forward ? a.x + a.w : a.x;
    const x2 = forward ? b.x : b.x + b.w;
    const y1 = a.y + CARD_H / 2;
    const y2 = b.y + CARD_H / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    const c1 = forward ? x1 + dx : x1 - dx;
    const c2 = forward ? x2 - dx : x2 + dx;
    edges.push(
      `<path class="e-${e.type}" data-a="${htmlId(e.from)}" data-b="${htmlId(e.to)}" d="M${x1} ${y1} C${c1} ${y1},${c2} ${y2},${x2} ${y2}"/>`,
    );
  }
  return `<div class="cv" id="cv" data-view="now" tabindex="0" aria-label="Context canvas">
<div class="cv-world" id="world" style="width:${worldW}px;height:${worldH}px">
${frameHtml.join("\n")}
<svg class="edges" width="${worldW}" height="${worldH}" aria-hidden="true">${edges.join("")}</svg>
${cards.join("\n")}
</div>
<div class="cv-tools"><button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="fit">Fit</button><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-edges aria-pressed="false" title="Show every link (L)">All links</button></div>
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
  if (str(a.lede)) add("Says", md(str(a.lede) ?? ""));
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
      return `<article class="detail" id="${htmlId(n.id)}" data-node="${esc(n.id)}"><header><span class="k">${esc(TYPE_LABEL[n.type])} · ${esc(domainLabel)}</span><h3>${md(n.title)}</h3>${sourceLink(n, prefix)}</header>${issueList(n.issues)}${attrRows(n)}${edgeList(ix, n)}${comment}</article>`;
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
  return `<section class="view" id="view-lessons" data-title="Lessons"><h2>Lessons proposed <span class="k">local</span></h2><p class="k">Patches reviews keep asking for, and the rule that would prevent them. Accept, edit or reject them with <code>/lessons</code>.</p><div class="lessons">${lessons
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
