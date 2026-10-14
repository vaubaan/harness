import type { StopHookAdapter } from "../types.js";

/**
 * Codex CLI Stop hook protocol mirrors Claude Code's: same input
 * shape (`session_id`, `stop_hook_active`) and same output contract
 * (`{decision: "block", reason}` to continue, `{}` to stop).
 *
 * See https://developers.openai.com/codex/hooks
 */
export const codexAdapter: StopHookAdapter = {
  parseInput(stdin) {
    const parsed = stdin.trim() === "" ? {} : (JSON.parse(stdin) as Record<string, unknown>);
    return {
      sessionId: typeof parsed.session_id === "string" ? parsed.session_id : "default",
      stopHookActive: parsed.stop_hook_active === true,
    };
  },
  respond(decision) {
    if (decision.kind === "inject") {
      return {
        stdout: `${JSON.stringify({ decision: "block", reason: decision.reason ?? "" })}\n`,
        stderr: "",
        exitCode: 0,
      };
    }
    if (decision.kind === "terminate") {
      return {
        stdout: "",
        stderr: `${decision.reason ?? ""}\n`,
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  },
};
