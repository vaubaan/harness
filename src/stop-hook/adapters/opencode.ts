import type { StopHookAdapter } from "../types.js";

/**
 * opencode plugin Stop hook protocol (proxied by the rendered TS plugin):
 *
 *   in  ← JSON on stdin with `sessionID` (mapped from opencode's session
 *         context object the plugin received).
 *   out → exit code 2 + a prompt string on stderr to inject a continuation;
 *         exit 0 + empty output to let the session stop.
 *
 * opencode does NOT expose a `stop_hook_active`-equivalent flag, so the
 * core anti-loop layers (dirty-gate + counter + no-progress) carry the
 * full defense weight here.
 *
 * See https://opencode.ai/docs/plugins/
 */
export const opencodeAdapter: StopHookAdapter = {
  parseInput(stdin) {
    const parsed = stdin.trim() === "" ? {} : (JSON.parse(stdin) as Record<string, unknown>);
    const sessionId =
      typeof parsed.sessionID === "string"
        ? parsed.sessionID
        : typeof parsed.session_id === "string"
          ? parsed.session_id
          : "default";
    return { sessionId, stopHookActive: false };
  },
  respond(decision) {
    if (decision.kind === "inject") {
      return { stdout: "", stderr: `${decision.reason ?? ""}\n`, exitCode: 2 };
    }
    if (decision.kind === "terminate") {
      return { stdout: "", stderr: `${decision.reason ?? ""}\n`, exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  },
};
