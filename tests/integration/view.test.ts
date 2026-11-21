import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { viewCommand } from "../../src/cli/view.js";
import { buildGraph, serializeGraph } from "../../src/view/graph.js";
import { htmlId, renderView } from "../../src/view/html.js";

const FIXTURE = resolve(__dirname, "../fixtures/acme-billing");
const PACKAGE_DIR = resolve(__dirname, "../../src");
const REPO_ROOT = resolve(__dirname, "../..");

let repo: string;

function git(cmd: string): void {
  execSync(cmd, { cwd: repo, stdio: "ignore" });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cah-view-"));
  cpSync(FIXTURE, repo, { recursive: true });
  renameSync(join(repo, "gitignore.txt"), join(repo, ".gitignore"));
  git("git init -q && git config user.email t@t && git config user.name t");
  git("git add -A && git commit -q -m init");
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

const build = () => buildGraph(repo, { packageDir: PACKAGE_DIR });

describe("context graph", () => {
  it("indexes the pillars of the README example", () => {
    const g = build();
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const id of [
      "doc:README.md",
      "doc:docs/spec/invoicing.md",
      "term:invoice",
      "term:draft",
      "doc:docs/decisions/postgres-over-sqlite.md",
      "alt:postgres-over-sqlite/sqlite",
      "doc:docs/handbook/invoice-pipeline.md",
      "glob:src/invoicing/**/*.ts",
      "doc:docs/intents/send-an-invoice.md",
      "intent:send-an-invoice/issue-the-draft",
      "intent:send-an-invoice/email-the-invoice",
      "path:src/invoicing/issue.ts",
      "linter:cross-links",
      "skill:spec-writer",
      "cmd:spec",
    ]) {
      expect(ids, id).toContain(id);
    }
    const edge = (from: string, type: string, to: string) =>
      g.edges.some((e) => e.from === from && e.type === type && e.to === to);
    expect(
      edge("doc:docs/handbook/invoice-pipeline.md", "tracks", "glob:src/invoicing/**/*.ts"),
    ).toBe(true);
    expect(edge("intent:send-an-invoice/issue-the-draft", "requires", "term:draft")).toBe(true);
    expect(edge("intent:send-an-invoice/issue-the-draft", "creates", "term:invoice")).toBe(true);
    expect(
      edge("intent:send-an-invoice/issue-the-draft", "anchors", "path:src/invoicing/issue.ts"),
    ).toBe(true);
    expect(
      edge("intent:send-an-invoice/issue-the-draft", "spec", "sec:docs/spec/invoicing.md#1-vision"),
    ).toBe(true);
    expect(
      edge(
        "doc:docs/handbook/invoice-pipeline.md",
        "links-to",
        "doc:docs/decisions/postgres-over-sqlite.md",
      ),
    ).toBe(true);
    expect(edge("cmd:spec", "invokes", "skill:spec-writer")).toBe(true);
    expect(edge("linter:spec-tech-agnostic", "suggests", "skill:spec-writer")).toBe(true);
  });

  it("gives every node a stable id, its domain, its source file and line", () => {
    const g = build();
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    expect(byId.get("linter:cross-links")?.domain).toBe("harness");
    expect(byId.get("skill:spec-writer")?.domain).toBe("harness");
    expect(byId.get("doc:docs/spec/invoicing.md")?.domain).toBe("project");
    const intent = byId.get("intent:send-an-invoice/void-an-invoice");
    expect(intent?.sourcePath).toBe("docs/intents/send-an-invoice.md");
    expect(intent?.line).toBe(20);
    const ids = new Set(byId.keys());
    for (const e of g.edges) {
      expect(ids.has(e.from) && ids.has(e.to), `${e.from} → ${e.to}`).toBe(true);
    }
  });

  it("writes .vaubaan/graph.json byte-identical across two runs on the same tree", () => {
    const first = viewCommand({ targetDir: repo, packageDir: PACKAGE_DIR });
    const a = readFileSync(first.graphPath, "utf8");
    const b = readFileSync(
      viewCommand({ targetDir: repo, packageDir: PACKAGE_DIR }).graphPath,
      "utf8",
    );
    expect(a).toBe(b);
    expect(a).toBe(serializeGraph(first.graph));
  });

  it("attaches each lint issue to the deepest node at or above its line", () => {
    const intents = readFileSync(join(repo, "docs/intents/send-an-invoice.md"), "utf8");
    writeFileSync(
      join(repo, "docs/intents/send-an-invoice.md"),
      intents.replace(
        "requires: invoice\nanchors: src/invoicing/void.ts",
        "requires: credit-note\nanchors: src/invoicing/gone.ts",
      ),
    );
    const g = build();
    const intent = g.nodes.find((n) => n.id === "intent:send-an-invoice/void-an-invoice");
    expect(intent?.issues.map((i) => i.linter).sort()).toEqual([
      "lint:intent-anchors",
      "lint:intent-graph",
      "lint:intent-vocabulary",
    ]);
    expect(g.nodes.find((n) => n.id === "term:credit-note")?.attrs.defined).toBe(false);
    expect(g.nodes.find((n) => n.id === "path:src/invoicing/gone.ts")?.attrs.exists).toBe(false);
    expect(g.lint.errors).toBeGreaterThan(0);
  });

  it("reads the docs of this repository", () => {
    const g = buildGraph(REPO_ROOT, { lint: false, packageDir: PACKAGE_DIR });
    expect(g.nodes.filter((n) => n.type === "linter")).toHaveLength(21);
    expect(
      g.nodes.some((n) => n.id === "intent:review-the-context/see-the-whole-context-on-one-canvas"),
    ).toBe(true);
    expect(g.nodes.some((n) => n.id === "term:context-graph")).toBe(true);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) expect(ids.has(e.from) && ids.has(e.to)).toBe(true);
  });
});

describe("view", () => {
  it("shows one card per document, grouped by pillar, on a map that fits one screen", () => {
    const g = buildGraph(REPO_ROOT, { lint: false, packageDir: PACKAGE_DIR });
    const html = renderView(g);
    const docs = g.nodes.filter((n) =>
      [
        "readme",
        "spec",
        "decision",
        "handbook",
        "test-plan",
        "workflow",
        "quality",
        "doc",
        "intent-file",
      ].includes(n.type),
    );
    const cards = [...html.matchAll(/<a class="n t-([a-z-]+)[^"]*" id="c-/g)].map((m) => m[1]);
    expect(cards).toHaveLength(docs.length);
    const world = /id="world" style="width:(\d+)px;height:(\d+)px"/.exec(html);
    // At 1440 × 860, the fit zoom stays at 0.7 or more: card titles stay at 9 px or more.
    expect(Math.min(1440 / Number(world?.[1]), 860 / Number(world?.[2]))).toBeGreaterThanOrEqual(
      0.7,
    );
  });

  it("shows terms, code paths, rejected alternatives and lint issues as counts on their document's card", () => {
    const html = renderView(build());
    for (const type of ["term", "path", "glob", "alternative", "known-gap", "linter", "skill"]) {
      expect(html, type).not.toMatch(new RegExp(`<a class="n t-${type}[ "]`));
    }
    expect(html).toContain("2 terms · ");
    expect(html).toContain("1 alternative");
  });

  it("draws the links between documents at rest, one line per pair of cards with its count", () => {
    const g = build();
    const html = renderView(g);
    const pairs = [...html.matchAll(/<path class="me" data-a="([^"]+)" data-b="([^"]+)"/g)].map(
      (m) => `${m[1]}|${m[2]}`,
    );
    expect(pairs.length).toBeGreaterThan(0);
    expect(new Set(pairs).size).toBe(pairs.length);
    const handbook = htmlId("doc:docs/handbook/invoice-pipeline.md");
    const adr = htmlId("doc:docs/decisions/postgres-over-sqlite.md");
    expect(pairs.some((p) => p.includes(handbook) && p.includes(adr))).toBe(true);
  });

  it("selecting a card shows its neighbours around it: what it cites, what cites it, the code it tracks, the words it uses", () => {
    const html = renderView(build());
    const layer = (doc: string) => {
      const start = html.indexOf(`<div class="focus" data-for="${htmlId(doc)}"`);
      return html.slice(start, html.indexOf('<div class="focus"', start + 10) >>> 0 || undefined);
    };
    const handbook = layer("doc:docs/handbook/invoice-pipeline.md");
    expect(handbook).toContain(">Tracks <i>2</i>");
    expect(handbook).toContain(`data-n="${htmlId("glob:src/invoicing/**/*.ts")}"`);
    expect(handbook).toContain(
      `data-n="${htmlId("doc:docs/decisions/postgres-over-sqlite.md")}" data-doc="1"`,
    );
    const intents = layer("doc:docs/intents/send-an-invoice.md");
    expect(intents).toContain(">Uses words <i>2</i>");
    expect(intents).toContain(`data-n="${htmlId("path:src/invoicing/issue.ts")}"`);
    const spec = layer("doc:docs/spec/invoicing.md");
    expect(spec).toContain(">Vocabulary <i>2</i>");
    expect(spec).toContain(">Cited by");
  });

  it("opens from disk and makes no network request", () => {
    const html = renderView(build());
    expect(html).not.toMatch(/<(script|link|img|iframe)[^>]+(src|href)="(https?:)?\/\//);
    expect(html).not.toMatch(/@import|url\(\s*["']?https?:/);
    expect(html).not.toContain("innerHTML");
  });

  it("links every card to its source file and line", () => {
    const g = build();
    const html = renderView(g);
    for (const n of g.nodes.filter(
      (x) => x.domain === "project" && x.line > 0 && x.type !== "glob",
    )) {
      expect(html, n.id).toContain(`href="../../${n.sourcePath}"`);
      expect(html, n.id).toContain(`id="${htmlId(n.id)}"`);
    }
    expect(html).toContain("docs/intents/send-an-invoice.md:20");
  });

  it("shows the state of the context, the intent tree, the vocabulary, the decisions, the linters and the skills", () => {
    const html = renderView(build());
    for (const view of [
      "canvas",
      "overview",
      "intents",
      "vocabulary",
      "decisions",
      "linters",
      "skills",
    ]) {
      expect(html).toContain(`id="view-${view}"`);
    }
    expect(html).toContain("Email the invoice");
    expect(html).toContain("Rejected · SQLite");
  });

  it("is byte-identical for an identical tree", () => {
    expect(renderView(build())).toBe(renderView(build()));
  });
});
