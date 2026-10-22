import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, readManifest } from "../../src/cli/manifest.js";
import { renderCommand } from "../../src/cli/render.js";
import { AGENT_IDS, ENGINES, ENGINE_ROOT_DIR } from "../../src/types.js";

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
    it(`renders all 4 agent personas for engines=[${engine}]`, () => {
      const result = initCommand({
        targetDir: sandbox,
        engines: [engine],
        packageDir: PACKAGE_DIR,
      });

      expect(result.filesWritten.length).toBeGreaterThan(0);
      expect(existsSync(join(sandbox, "AGENTS.md"))).toBe(true);

      const agentsMd = readFileSync(join(sandbox, "AGENTS.md"), "utf8");
      expect(agentsMd.length).toBeGreaterThan(100);
      // The umbrella is method-first: it teaches doc-first workflow + lists
      // skills/commands. Persona files (next assertion) carry persona-specific
      // bodies; the umbrella deliberately does not enumerate personas.
      expect(agentsMd).toMatch(/How we work/);

      const personaDir = `${ENGINE_ROOT_DIR[engine]}/agents/`;
      const personaFiles = result.filesWritten.filter((p) => p.startsWith(personaDir));
      expect(personaFiles.length).toBe(AGENT_IDS.length);

      const exposedSkillCount = result.filesWritten.filter((p) => p.includes("/skills/")).length;
      expect(exposedSkillCount).toBeGreaterThan(0);

      // Codex has no command files: custom prompts are deprecated in favour of skills.
      const cmdCount = result.filesWritten.filter((p) => p.includes("/commands/")).length;
      if (engine === "codex-cli") expect(cmdCount).toBe(0);
      else expect(cmdCount).toBeGreaterThan(0);
    });
  }

  it("defaults to all 3 engines when --engines is omitted", () => {
    const result = initCommand({
      targetDir: sandbox,
      packageDir: PACKAGE_DIR,
    });
    for (const engine of ENGINES) {
      const personaFiles = result.filesWritten.filter((p) =>
        p.startsWith(`${ENGINE_ROOT_DIR[engine]}/agents/`),
      );
      expect(personaFiles.length).toBe(AGENT_IDS.length);
    }
  });

  it("writes a manifest tracking engines + files (no agent field)", () => {
    const result = initCommand({
      targetDir: sandbox,
      engines: ["claude-code", "codex-cli"],
      packageDir: PACKAGE_DIR,
    });

    expect(existsSync(join(sandbox, MANIFEST_FILENAME))).toBe(true);
    const manifest = readManifest(sandbox);
    expect(manifest).not.toBeNull();
    expect(manifest?.engines.sort()).toEqual(["claude-code", "codex-cli"]);
    // Hook files the harness created are ordinary generated files.
    expect(manifest?.files.sort()).toEqual([...result.filesWritten].sort());
    expect(manifest?.files).toContain(".claude/settings.json");
    expect(manifest?.files).toContain(".codex/hooks.json");
  });

  it("installs stop-hook configs by default and records it in the manifest", () => {
    const result = initCommand({
      targetDir: sandbox,
      packageDir: PACKAGE_DIR,
    });
    expect(result.stopHookInstalled).toBe(true);
    expect(result.filesWritten).toContain(".claude/settings.json");
    expect(result.filesWritten).toContain(".codex/hooks.json");
    expect(result.filesWritten).toContain(".opencode/plugins/harness-stop-hook.ts");
    const manifest = readManifest(sandbox);
    expect(manifest?.stopHookInstalled).toBe(true);
    expect(manifest?.stopHookEngines?.sort()).toEqual([...ENGINES].sort());
  });

  it("withStopHook: false skips the stop-hook configs and flags the manifest", () => {
    const result = initCommand({
      targetDir: sandbox,
      packageDir: PACKAGE_DIR,
      withStopHook: false,
    });
    expect(result.stopHookInstalled).toBe(false);
    expect(result.filesWritten).not.toContain(".claude/settings.json");
    expect(result.filesWritten).not.toContain(".codex/hooks.json");
    expect(result.filesWritten).not.toContain(".opencode/plugins/harness-stop-hook.ts");
    const manifest = readManifest(sandbox);
    expect(manifest?.stopHookInstalled).toBe(false);
    expect(manifest?.stopHookEngines).toEqual([]);
  });

  it("does not expose /harness-lint anymore — the stop-hook runs lint directly", () => {
    const result = initCommand({
      targetDir: sandbox,
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten).not.toContain(".claude/commands/harness-lint.md");
    expect(result.filesWritten).not.toContain(".codex/commands/harness-lint.md");
    expect(result.filesWritten).not.toContain(".opencode/commands/harness-lint.md");
  });

  it("re-init removes files of the previous manifest that are no longer rendered", () => {
    initCommand({ targetDir: sandbox, packageDir: PACKAGE_DIR });
    const userFile = join(sandbox, ".codex", "notes.md");
    writeFileSync(userFile, "mine");

    const result = initCommand({
      targetDir: sandbox,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });

    expect(result.staleFilesRemoved).toContain(".codex/agents/coding.toml");
    expect(existsSync(join(sandbox, ".codex", "agents"))).toBe(false);
    expect(existsSync(join(sandbox, ".agents"))).toBe(false);
    expect(existsSync(userFile)).toBe(true);
    expect(existsSync(join(sandbox, ".claude", "agents", "coding.md"))).toBe(true);
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
  it("renders preview output for all engines by default", () => {
    const out = mkdtempSync(join(tmpdir(), "cah-render-"));
    try {
      const result = renderCommand({
        outDir: out,
        packageDir: PACKAGE_DIR,
      });
      expect(result.filesWritten.some((p) => p === "AGENTS.md")).toBe(true);
      const umbrella = readFileSync(join(out, "AGENTS.md"), "utf8");
      expect(umbrella).toMatch(/How we work/);
      for (const engine of ENGINES) {
        for (const id of AGENT_IDS) {
          const ext = engine === "codex-cli" ? "toml" : "md";
          expect(result.filesWritten).toContain(`${ENGINE_ROOT_DIR[engine]}/agents/${id}.${ext}`);
        }
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
