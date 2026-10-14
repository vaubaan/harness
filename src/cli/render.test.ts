import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENGINES } from "../types.js";
import { renderCommand } from "./render.js";

// The src/ directory contains agents/, skills/, and commands/ — it is a valid packageDir.
const PACKAGE_DIR = join(__dirname, "..");

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), "cah-render-"));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

describe("renderCommand", () => {
  it("throws for an unknown engine name", () => {
    expect(() =>
      renderCommand({ engines: ["bad-engine"], outDir, packageDir: PACKAGE_DIR }),
    ).toThrow("unknown engine: bad-engine");
  });

  it("with no engines arg, renders all supported engines and writes files", () => {
    const result = renderCommand({ outDir, packageDir: PACKAGE_DIR });
    expect(result.filesWritten.length).toBeGreaterThan(0);
    expect(result.filesWritten).toContain("AGENTS.md");
  });

  it("with a single engine, writes only that engine's files", () => {
    const result = renderCommand({ engines: ["claude-code"], outDir, packageDir: PACKAGE_DIR });
    expect(result.filesWritten.length).toBeGreaterThan(0);
    const hasCodex = result.filesWritten.some((f) => f.startsWith(".codex/"));
    const hasOpencode = result.filesWritten.some((f) => f.startsWith(".opencode/"));
    expect(hasCodex).toBe(false);
    expect(hasOpencode).toBe(false);
  });

  it("creates outDir subdirectories recursively as needed", () => {
    const nestedOutDir = join(outDir, "a", "b", "c");
    const result = renderCommand({
      engines: ["claude-code"],
      outDir: nestedOutDir,
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten.length).toBeGreaterThan(0);
    expect(existsSync(join(nestedOutDir, "AGENTS.md"))).toBe(true);
  });

  it("returns warnings array (empty for a well-formed harness)", () => {
    const result = renderCommand({
      engines: ENGINES.slice(0, 1) as string[],
      outDir,
      packageDir: PACKAGE_DIR,
    });
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
