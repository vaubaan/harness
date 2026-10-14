import type { StopHookAdapter } from "../types.js";

/**
 * Claude Code Stop hook protocol:
 *
 *   in  ← JSON on stdin with `session_id` and `stop_hook_active`
 *   out → JSON on stdout with `{decision: "block", reason}` to force
 *         continuation, or `{}` to let the session truly stop.
 *
 * See https://docs.claude.com/en/docs/claude-code/hooks
 */
export const claudeAdapter: StopHookAdapter = {
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
