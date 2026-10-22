import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, readManifest } from "../../src/cli/manifest.js";
import { renderCommand } from "../../src/cli/render.js";
import { ENGINES, ENGINE_ROOT_DIR } from "../../src/types.js";

const PACKAGE_DIR = resolve(__dirname, "..", "..", "src");

let sandbox: string;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cah-init-"));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("initCommand integration — multi-engine harness", () => {
  for (const engine of ENGINES) {
    it(`renders the umbrella, skills and commands for engines=[${engine}], no persona`, () => {
      const result = initCommand({
        targetDir: sandbox,
        engines: [engine],
        packageDir: PACKAGE_DIR,
      });

      expect(result.filesWritten.length).toBeGreaterThan(0);
      expect(existsSync(join(sandbox, "AGENTS.md"))).toBe(true);

      const agentsMd = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
      expect(agentsMd.length).toBeGreaterThan(100);
      // The umbrella is method-first: the one working rule, the project map,
      // the checks and the exposed skills. It names no persona.
      expect(agentsMd).toMatch(/How we work/);
      expect(agentsMd).toMatch(/## Checks/);

      expect(result.filesWritten.some((p) => p.includes("/agents/"))).toBe(false);
      expect(existsSync(join(sandbox, ENGINE_ROOT_DIR[engine], "agents"))).toBe(false);

      const exposedSkillCount = result.filesWritten.filter((p) => p.includes("/skills/")).length;
      expect(exposedSkillCount).toBeGreaterThan(0);

      // Codex has no command files: custom prompts are deprecated in favour of skills.
      const cmdCount = result.filesWritten.filter((p) => p.includes("/commands/")).length;
      if (engine === "codex-cli") expect(cmdCount).toBe(0);
      else expect(cmdCount).toBeGreaterThan(0);

      // No engine settings, hook or plugin is ever written.
      expect(result.filesWritten).not.toContain(".claude/settings.json");
      expect(result.filesWritten).not.toContain(".codex/hooks.json");
      expect(result.filesWritten.some((p) => p.startsWith(".opencode/plugins/"))).toBe(false);
    });
  }

  it("requires an explicit engine selection", () => {
    expect(() => initCommand({ targetDir: sandbox, engines: [], packageDir: PACKAGE_DIR })).toThrow(
      /no engine selected/,
    );
    expect(existsSync(join(sandbox, MANIFEST_FILENAME))).toBe(false);
  });

  it("renders every requested engine side by side with a single umbrella", () => {
    const result = initCommand({
      targetDir: sandbox,
      engines: [...ENGINES],
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten.filter((p) => p === "AGENTS.md")).toHaveLength(1);
    expect(result.filesWritten).toContain(".claude/skills/doc-audit/SKILL.md");
    expect(result.filesWritten).toContain(".agents/skills/doc-audit/SKILL.md");
    expect(result.filesWritten).toContain(".opencode/commands/doc-audit.md");
    // OpenCode reuses the skills exposed by the other engines.
    expect(result.filesWritten.some((p) => p.startsWith(".opencode/skills/"))).toBe(false);
  });

  it("writes a manifest tracking engines + files with their fingerprints", () => {
    const result = initCommand({
      targetDir: sandbox,
      engines: ["claude-code", "codex-cli"],
      packageDir: PACKAGE_DIR,
    });

    expect(existsSync(join(sandbox, MANIFEST_FILENAME))).toBe(true);
    const manifest = readManifest(sandbox);
    expect(manifest).not.toBeNull();
    expect(manifest?.version).toBe("6");
    expect(manifest?.engines.sort()).toEqual(["claude-code", "codex-cli"]);
    expect(manifest?.files.sort()).toEqual([...result.filesWritten].sort());
    for (const path of manifest?.files ?? []) {
      expect(manifest?.fileHashes?.[path]).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("re-init removes files of the previous manifest that are no longer rendered", () => {
    initCommand({ targetDir: sandbox, engines: [...ENGINES], packageDir: PACKAGE_DIR });
    const userFile = join(sandbox, ".agents", "notes.md");
    writeFileSync(userFile, "mine");

    const result = initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });

    expect(result.staleFilesRemoved).toContain(".agents/skills/doc-audit/SKILL.md");
    expect(result.staleFilesRemoved).toContain(".opencode/commands/doc-audit.md");
    expect(existsSync(join(sandbox, ".agents", "skills"))).toBe(false);
    expect(existsSync(join(sandbox, ".opencode"))).toBe(false);
    expect(existsSync(userFile)).toBe(true);
    expect(existsSync(join(sandbox, ".claude", "skills", "doc-audit", "SKILL.md"))).toBe(true);
  });

  it("rejects unknown engine", () => {
    expect(() =>
      initCommand({
        targetDir: sandbox,
        engines: ["vim"],
        packageDir: PACKAGE_DIR,
      }),
    ).toThrow(/unknown engine/);
  });
});

describe("initCommand integration — project skills", () => {
  it("discovers and renders project skills from docs/skills/", () => {
    const skillsDir = join(sandbox, "docs", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "new-plugin-guide.skill.md"),
      `---
id: new-plugin-guide
description: How to implement a new plugin.
---

# Plugin guide body
`,
    );
    const result = initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten).toContain(".claude/skills/new-plugin-guide/SKILL.md");
    const skillFile = readFileSync(
      join(sandbox, ".claude/skills/new-plugin-guide/SKILL.md"),
      "utf8",
    );
    expect(skillFile).toContain("new-plugin-guide");
    expect(skillFile).toContain("Plugin guide body");

    const umbrella = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
    expect(umbrella).toMatch(/new-plugin-guide/);
    expect(umbrella).toMatch(/docs\/skills\/\*\.skill\.md/);
  });

  it("works normally when docs/skills/ is absent (no regression)", () => {
    const result = initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten.length).toBeGreaterThan(0);
    const umbrella = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
    expect(umbrella).not.toMatch(/docs\/skills/);
  });
});

describe("initCommand integration — quality pillar", () => {
  it("mentions docs/quality/code-quality.md in the umbrella when the file exists", () => {
    const qualityDir = join(sandbox, "docs", "quality");
    mkdirSync(qualityDir, { recursive: true });
    writeFileSync(join(qualityDir, "code-quality.md"), "# Code quality\n");
    initCommand({ targetDir: sandbox, engines: ["claude-code"], packageDir: PACKAGE_DIR });
    const umbrella = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
    expect(umbrella).toMatch(/docs\/quality\/code-quality\.md/);
  });

  it("omits the quality line when docs/quality/ is absent (no regression)", () => {
    initCommand({ targetDir: sandbox, engines: ["claude-code"], packageDir: PACKAGE_DIR });
    const umbrella = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
    expect(umbrella).not.toMatch(/docs\/quality/);
  });

  it("omits the quality line when docs/quality/ has no cardinal file", () => {
    mkdirSync(join(sandbox, "docs", "quality"), { recursive: true });
    initCommand({ targetDir: sandbox, engines: ["claude-code"], packageDir: PACKAGE_DIR });
    const umbrella = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
    expect(umbrella).not.toMatch(/docs\/quality/);
  });
});

describe("renderCommand integration", () => {
  it("renders preview output for every engine", () => {
    const out = mkdtempSync(join(tmpdir(), "cah-render-"));
    try {
      const result = renderCommand({
        engines: [...ENGINES],
        outDir: out,
        packageDir: PACKAGE_DIR,
      });
      expect(result.filesWritten.some((p) => p === "AGENTS.md")).toBe(true);
      const umbrella = readFileSync(join(out, "AGENTS.md"), "utf8");
      expect(umbrella).toMatch(/How we work/);
      expect(result.filesWritten).toContain(".claude/commands/doc-audit.md");
      expect(result.filesWritten).toContain(".agents/skills/doc-audit/SKILL.md");
      expect(result.filesWritten).toContain(".opencode/commands/doc-audit.md");
      expect(result.filesWritten.some((p) => p.includes("/agents/"))).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
