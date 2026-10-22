export const ENGINES = ["claude-code", "codex-cli", "opencode"] as const;
export type Engine = (typeof ENGINES)[number];

export const ENGINE_ROOT_DIR: Record<Engine, string> = {
  "claude-code": ".claude",
  "codex-cli": ".codex",
  opencode: ".opencode",
};

export const CAPABILITIES = ["multi-step", "slash-command", "inline-exec"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface RenderedFile {
  path: string;
  content: string;
}

export interface CapabilitiesMatrix {
  [engine: string]: ReadonlyArray<Capability>;
}

export const CAPABILITIES_MATRIX: Record<Engine, ReadonlyArray<Capability>> = {
  "claude-code": ["multi-step", "slash-command", "inline-exec"],
  "codex-cli": ["multi-step", "slash-command", "inline-exec"],
  opencode: ["multi-step", "slash-command", "inline-exec"],
};

export const DEGRADED_CAPABILITIES: Partial<Record<Engine, ReadonlyArray<Capability>>> = {
  "codex-cli": ["multi-step"],
};

export function engineSupports(engine: Engine, capability: Capability): boolean {
  return CAPABILITIES_MATRIX[engine].includes(capability);
}
