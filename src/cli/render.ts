import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadHarness } from "../loader.js";
import { resolveMcpIds } from "../mcp.js";
import { render as renderHarness } from "../render.js";
import { ENGINES, type Engine } from "../types.js";

export interface RenderArgs {
  engines?: ReadonlyArray<string>;
  outDir: string;
  packageDir: string;
  mcpServers?: ReadonlyArray<string>;
  withStopHook?: boolean;
}

export interface RenderCommandResult {
  filesWritten: string[];
  warnings: string[];
}

export function renderCommand(args: RenderArgs): RenderCommandResult {
  const engineList: Engine[] =
    args.engines && args.engines.length > 0
      ? args.engines.map((e) => {
          if (!ENGINES.includes(e as Engine)) {
            throw new Error(`unknown engine: ${e}`);
          }
          return e as Engine;
        })
      : [...ENGINES];
  const harness = loadHarness(args.packageDir);
  const mcpServers = args.mcpServers ? resolveMcpIds(args.mcpServers) : undefined;
  const output = renderHarness({
    harness,
    engines: engineList,
    mcpServers,
    withStopHook: args.withStopHook !== false,
  });
  const filesWritten: string[] = [];
  for (const f of output.files) {
    const full = join(args.outDir, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
    filesWritten.push(f.path);
  }
  return { filesWritten, warnings: output.warnings };
}
