import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MANIFEST_FILENAME,
  MANIFEST_VERSION,
  manifestPath,
  readManifest,
  writeManifest,
} from "./manifest.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cah-manifest-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("manifestPath", () => {
  it("returns path ending with the manifest filename", () => {
    const p = manifestPath(dir);
    expect(p).toBe(join(dir, MANIFEST_FILENAME));
    expect(p.endsWith(".harness-manifest.json")).toBe(true);
  });
});

describe("readManifest", () => {
  it("returns null when file does not exist", () => {
    expect(readManifest(dir)).toBeNull();
  });

  it("throws a zod parse error when version field is wrong", () => {
    writeManifest(dir, ["claude-code"], ["AGENTS.md"]);
    const path = manifestPath(dir);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    raw.version = "3";
    writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
    expect(() => readManifest(dir)).toThrow();
  });

  it("drops the 1.x hook and MCP ownership fields on read", () => {
    writeManifest(dir, ["claude-code"], ["AGENTS.md"]);
    const path = manifestPath(dir);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    raw.stopHookInstalled = true;
    raw.stopHookEngines = ["claude-code"];
    raw.hookConfigs = {};
    raw.mcpConfig = { entries: {} };
    raw.opencodeConfig = { entries: {} };
    writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`);
    const manifest = readManifest(dir) as Record<string, unknown> | null;
    expect(manifest).not.toBeNull();
    for (const key of [
      "stopHookInstalled",
      "stopHookEngines",
      "hookConfigs",
      "mcpConfig",
      "opencodeConfig",
    ]) {
      expect(manifest?.[key]).toBeUndefined();
    }
  });
});

describe("writeManifest + readManifest", () => {
  it("creates valid JSON with sorted engines and files", () => {
    writeManifest(dir, ["opencode", "claude-code"], ["z.md", "a.md"]);
    const manifest = readManifest(dir);
    expect(manifest).not.toBeNull();
    expect(manifest?.version).toBe(MANIFEST_VERSION);
    expect(manifest?.engines).toEqual(["claude-code", "opencode"]);
    expect(manifest?.files).toEqual(["a.md", "z.md"]);
  });

  it("round-trips: readManifest parses back what writeManifest wrote", () => {
    writeManifest(dir, ["codex-cli"], ["docs/spec/foo.md", "AGENTS.md"]);
    const manifest = readManifest(dir);
    expect(manifest).not.toBeNull();
    expect(manifest?.engines).toEqual(["codex-cli"]);
    expect(manifest?.files).toEqual(["AGENTS.md", "docs/spec/foo.md"]);
    expect(manifest?.renderedAt).toBeTruthy();
  });

  it("records preserved files and the overrides parent when provided", () => {
    writeManifest(dir, ["claude-code"], ["AGENTS.md"], {
      preservedFiles: ["CLAUDE.md"],
      overridesDir: ".",
    });
    const manifest = readManifest(dir);
    expect(manifest?.preservedFiles).toEqual(["CLAUDE.md"]);
    expect(manifest?.overridesDir).toBe(".");
  });
});
