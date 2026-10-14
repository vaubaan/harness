import type { StopHookAdapter, StopHookEngine } from "../types.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { opencodeAdapter } from "./opencode.js";

export const ADAPTERS: Record<StopHookEngine, StopHookAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  opencode: opencodeAdapter,
};

export function getAdapter(engine: StopHookEngine): StopHookAdapter {
  return ADAPTERS[engine];
}
