import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERSION } from "../version.js";

describe("package version", () => {
  it("shares the package version across CLI and public API", async () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
    expect((await import("../index.js")).VERSION).toBe(pkg.version);
    expect(readFileSync(join(__dirname, "index.ts"), "utf8")).toContain(".version(VERSION)");
  });
});
