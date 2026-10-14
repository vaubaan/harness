import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAdapter } from "../stop-hook/adapters/index.js";
import { decide, defaultGitStatus, defaultRunLint } from "../stop-hook/core.js";
import { STOP_HOOK_ENGINES, type StopHookEngine } from "../stop-hook/types.js";

export interface StopHookArgs {
  engine: string;
  cwd?: string;
}

export interface StopHookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function readStdinSync(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function assertEngine(engine: string): StopHookEngine {
  if (!(STOP_HOOK_ENGINES as ReadonlyArray<string>).includes(engine)) {
    throw new Error(`unknown engine: ${engine} (expected one of ${STOP_HOOK_ENGINES.join(", ")})`);
  }
  return engine as StopHookEngine;
}

export function stopHookCommand(args: StopHookArgs, stdin: string): StopHookResult {
  const engine = assertEngine(args.engine);
  const cwd = resolve(args.cwd ?? ".");
  const adapter = getAdapter(engine);
  const payload = adapter.parseInput(stdin, process.env);
  const decision = decide(payload, {
    cwd,
    env: process.env,
    gitStatus: defaultGitStatus,
    runLint: defaultRunLint,
  });
  return adapter.respond(decision);
}

export function stopHookCommandFromStdin(args: StopHookArgs): StopHookResult {
  return stopHookCommand(args, readStdinSync());
}
