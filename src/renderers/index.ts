import type { Engine } from "../types.js";
import { claudeCodeRenderer } from "./claude-code.js";
import { codexCliRenderer } from "./codex-cli.js";
import type { Renderer } from "./common.js";
import { opencodeRenderer } from "./opencode.js";

export const RENDERERS: Record<Engine, Renderer> = {
  "claude-code": claudeCodeRenderer,
  "codex-cli": codexCliRenderer,
  opencode: opencodeRenderer,
};

export function getRenderer(engine: Engine): Renderer {
  return RENDERERS[engine];
}

export type { Renderer, RenderResult } from "./common.js";
