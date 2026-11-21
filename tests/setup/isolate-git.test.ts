import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { GIT_LOCAL_ENV_VARS } from "./isolate-git.js";

describe("test isolation from a git hook", () => {
  it("clears every variable git uses to locate a repository", () => {
    for (const name of GIT_LOCAL_ENV_VARS) expect(process.env[name]).toBeUndefined();
  });

  it("covers the list git itself reports", () => {
    const reported = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    expect([...GIT_LOCAL_ENV_VARS].sort()).toEqual(expect.arrayContaining(reported.sort()));
  });
});
