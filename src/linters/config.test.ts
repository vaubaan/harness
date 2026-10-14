import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLintConfig } from "./config.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-cfg-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("loadLintConfig", () => {
  it("returns empty ignore when no config file exists", () => {
    const cfg = loadLintConfig(root);
    expect(cfg.ignore).toEqual([]);
  });

  it("reads ignore from .harnessrc.json", () => {
    writeFileSync(
      join(root, ".harnessrc.json"),
      JSON.stringify({ lint: { ignore: ["vendor/**", "legacy/**"] } }),
    );
    const cfg = loadLintConfig(root);
    expect(cfg.ignore).toEqual(["vendor/**", "legacy/**"]);
  });

  it("reads ignore from package.json harness key", () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "test", harness: { lint: { ignore: ["tmp/**"] } } }),
    );
    const cfg = loadLintConfig(root);
    expect(cfg.ignore).toEqual(["tmp/**"]);
  });

  it("ignores non-string values in ignore array", () => {
    writeFileSync(
      join(root, ".harnessrc.json"),
      JSON.stringify({ lint: { ignore: ["ok/**", 42, null, "also-ok/**"] } }),
    );
    const cfg = loadLintConfig(root);
    expect(cfg.ignore).toEqual(["ok/**", "also-ok/**"]);
  });

  it("returns empty ignore when lint key is missing", () => {
    writeFileSync(join(root, ".harnessrc.json"), JSON.stringify({ other: true }));
    const cfg = loadLintConfig(root);
    expect(cfg.ignore).toEqual([]);
  });
});
