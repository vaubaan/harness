import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type ContextGraph, GRAPH_PATH, buildGraph, serializeGraph } from "../view/graph.js";
import { renderView } from "../view/html.js";

export interface ViewArgs {
  targetDir: string;
  /** Directory receiving `graph.json` and `view/index.html`; default `<target>/.vaubaan`. */
  outDir?: string;
  /** Skip the linters (faster; no issue attached). */
  lint?: boolean;
  packageDir?: string;
}

export interface ViewResult {
  graph: ContextGraph;
  graphPath: string;
  htmlPath: string;
}

export const VIEW_PATH = ".vaubaan/view/index.html";

/** Builds the context graph and renders the view (docs/spec/coding-agent-harness.md §10.4). */
export function viewCommand(args: ViewArgs): ViewResult {
  const root = resolve(args.targetDir);
  const outDir = args.outDir ? resolve(args.outDir) : join(root, ".vaubaan");
  const graph = buildGraph(root, {
    ...(args.lint === false ? { lint: false } : {}),
    ...(args.packageDir ? { packageDir: args.packageDir } : {}),
  });
  const graphPath = join(outDir, "graph.json");
  const htmlPath = join(outDir, "view", "index.html");
  mkdirSync(dirname(htmlPath), { recursive: true });
  writeFileSync(graphPath, serializeGraph(graph));
  writeFileSync(htmlPath, renderView(graph));
  return { graph, graphPath, htmlPath };
}

export { GRAPH_PATH };
