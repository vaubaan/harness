import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadHarness } from "../loader.js";
import { render as renderHarness } from "../render.js";
import { resolveEngineList } from "./plan-render.js";

export interface RenderArgs {
  engines: ReadonlyArray<string>;
  outDir: string;
  packageDir: string;
}

export interface RenderCommandResult {
  filesWritten: string[];
  warnings: string[];
}

export function renderCommand(args: RenderArgs): RenderCommandResult {
  const engines = resolveEngineList(args.engines);
  const harness = loadHarness(args.packageDir);
  const output = renderHarness({ harness, engines });
  const filesWritten: string[] = [];
  for (const f of output.files) {
    const full = join(args.outDir, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
    filesWritten.push(f.path);
  }
  return { filesWritten, warnings: output.warnings };
}
