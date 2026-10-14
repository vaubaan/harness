import { describe, expect, it } from "vitest";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { opencodeAdapter } from "./opencode.js";

describe("claudeAdapter", () => {
  it("parses session_id and stop_hook_active from JSON payload", () => {
    const out = claudeAdapter.parseInput(
      JSON.stringify({ session_id: "abc-123", stop_hook_active: true }),
      {},
    );
    expect(out).toEqual({ sessionId: "abc-123", stopHookActive: true });
  });

  it("falls back to defaults when fields are missing", () => {
    const out = claudeAdapter.parseInput("{}", {});
    expect(out).toEqual({ sessionId: "default", stopHookActive: false });
  });

  it("falls back to defaults on empty stdin", () => {
    const out = claudeAdapter.parseInput("", {});
    expect(out).toEqual({ sessionId: "default", stopHookActive: false });
  });

  it("inject → JSON {decision:block, reason:<lint output>} on stdout", () => {
    const r = claudeAdapter.respond({ kind: "inject", reason: "LINT_REPORT_BODY" });
    const body = JSON.parse(r.stdout);
    expect(body).toEqual({ decision: "block", reason: "LINT_REPORT_BODY" });
    expect(r.exitCode).toBe(0);
  });

  it("terminate → reason on stderr, exit 0", () => {
    const r = claudeAdapter.respond({ kind: "terminate", reason: "give up" });
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/give up/);
    expect(r.exitCode).toBe(0);
  });

  it("passthrough → empty output, exit 0", () => {
    const r = claudeAdapter.respond({ kind: "passthrough" });
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
  });
});

describe("codexAdapter", () => {
  it("parses session_id and stop_hook_active identically to Claude", () => {
    const out = codexAdapter.parseInput(
      JSON.stringify({ session_id: "xyz", stop_hook_active: true }),
      {},
    );
    expect(out).toEqual({ sessionId: "xyz", stopHookActive: true });
  });

  it("inject → JSON {decision:block, reason} same shape as Claude", () => {
    const r = codexAdapter.respond({ kind: "inject", reason: "LINT_OUTPUT" });
    const body = JSON.parse(r.stdout);
    expect(body.decision).toBe("block");
    expect(body.reason).toBe("LINT_OUTPUT");
  });
});

describe("opencodeAdapter", () => {
  it("reads sessionID (opencode's casing) when provided", () => {
    const out = opencodeAdapter.parseInput(JSON.stringify({ sessionID: "oc-session-1" }), {});
    expect(out.sessionId).toBe("oc-session-1");
  });

  it("falls back to session_id when sessionID is absent", () => {
    const out = opencodeAdapter.parseInput(JSON.stringify({ session_id: "snake-case" }), {});
    expect(out.sessionId).toBe("snake-case");
  });

  it("always reports stopHookActive=false (no built-in flag)", () => {
    const out = opencodeAdapter.parseInput(
      JSON.stringify({ sessionID: "x", stop_hook_active: true }),
      {},
    );
    expect(out.stopHookActive).toBe(false);
  });

  it("inject → reason on stderr, exit code 2", () => {
    const r = opencodeAdapter.respond({ kind: "inject", reason: "LINT_OUTPUT" });
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/LINT_OUTPUT/);
    expect(r.exitCode).toBe(2);
  });

  it("terminate → reason on stderr, exit 0", () => {
    const r = opencodeAdapter.respond({ kind: "terminate", reason: "exhausted" });
    expect(r.stderr).toMatch(/exhausted/);
    expect(r.exitCode).toBe(0);
  });

  it("passthrough → no output, exit 0", () => {
    const r = opencodeAdapter.respond({ kind: "passthrough" });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe("");
  });
});
