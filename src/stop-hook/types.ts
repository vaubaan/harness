export const STOP_HOOK_ENGINES = ["claude", "codex", "opencode"] as const;
export type StopHookEngine = (typeof STOP_HOOK_ENGINES)[number];

export interface NormalizedPayload {
  sessionId: string;
  stopHookActive: boolean;
}

export interface EngineResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type DecisionKind = "passthrough" | "inject" | "terminate";

export interface Decision {
  kind: DecisionKind;
  /**
   * For `inject`: the lint report that the engine will hand back to the
   * agent as the next user-prompt.
   * For `terminate`: a short explanation surfaced via stderr.
   * For `passthrough`: unused.
   */
  reason?: string;
}

export interface StopHookAdapter {
  parseInput(stdin: string, env: NodeJS.ProcessEnv): NormalizedPayload;
  respond(decision: Decision): EngineResponse;
}

export interface LintState {
  attempts: number;
  lastLintHash: string;
  updatedAt: string;
}

export interface LintRunResult {
  pass: boolean;
  output: string;
}

export interface CoreEnv {
  cwd: string;
  env: NodeJS.ProcessEnv;
  gitStatus: (cwd: string) => string;
  runLint: (cwd: string) => LintRunResult;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
