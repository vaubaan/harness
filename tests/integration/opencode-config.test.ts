import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { initCommand } from "../../src/cli/init.js";
import { MANIFEST_FILENAME, readManifest } from "../../src/cli/manifest.js";
import { OPENCODE_CONFIG_PATH } from "../../src/cli/opencode-config.js";
import { uninstallCommand } from "../../src/cli/uninstall.js";

const PACKAGE_DIR = resolve(__dirname, "../../src");
let root: string;
const generated = { type: "local", command: ["npx", "-y", "@upstash/context7-mcp"], enabled: true };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-shared-config-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function configure(config: unknown) {
  mkdirSync(join(root, ".opencode"), { recursive: true });
  writeFileSync(join(root, OPENCODE_CONFIG_PATH), `${JSON.stringify(config)}\n`);
}

function readConfig() {
  return z
    .object({ mcp: z.record(z.unknown()).optional() })
    .passthrough()
    .parse(JSON.parse(readFileSync(join(root, OPENCODE_CONFIG_PATH), "utf8")));
}

function install(mcp = true) {
  return initCommand({
    targetDir: root,
    packageDir: PACKAGE_DIR,
    engines: ["opencode"],
    withStopHook: false,
    ...(mcp ? { mcpServers: ["context7"] } : {}),
  });
}

describe("shared OpenCode configuration lifecycle", () => {
  it("preserves model, permissions and other MCP servers through install, re-init and uninstall", () => {
    const original = {
      model: "custom/model",
      permission: { bash: "deny" },
      mcp: { internal: { type: "local", command: ["internal-mcp"] } },
    };
    configure(original);
    install();
    expect(readConfig()).toMatchObject(original);
    expect(readConfig().mcp?.context7).toEqual(generated);
    expect(readManifest(root)?.files).not.toContain(OPENCODE_CONFIG_PATH);
    expect(readManifest(root)?.opencodeConfig?.entries.context7).toEqual(generated);
    install();
    uninstallCommand({ targetDir: root });
    expect(readConfig()).toEqual(original);
  });

  it.each([generated, { type: "remote", url: "https://example.invalid/mcp", enabled: false }])(
    "never takes ownership of a pre-existing context7 entry: %j",
    (existing) => {
      const original = { mcp: { context7: existing }, permission: { bash: "deny" } };
      configure(original);
      const before = readFileSync(join(root, OPENCODE_CONFIG_PATH), "utf8");
      const result = install();
      expect(readFileSync(join(root, OPENCODE_CONFIG_PATH), "utf8")).toBe(before);
      expect(readManifest(root)?.opencodeConfig).toBeUndefined();
      if (existing !== generated) expect(result.warnings.join(" ")).toContain("preserved existing");
      uninstallCommand({ targetDir: root });
      expect(readConfig()).toEqual(original);
    },
  );

  it("removes a newly created, unchanged config when MCP is disabled", () => {
    install();
    install();
    const result = install(false);
    expect(result.staleFilesRemoved).toContain(OPENCODE_CONFIG_PATH);
    expect(existsSync(join(root, OPENCODE_CONFIG_PATH))).toBe(false);
    expect(readManifest(root)?.opencodeConfig).toBeUndefined();
  });

  it("removes a newly created, unchanged config on uninstall", () => {
    install();
    const result = uninstallCommand({ targetDir: root });
    expect(result.filesRemoved).toContain(OPENCODE_CONFIG_PATH);
    expect(existsSync(join(root, OPENCODE_CONFIG_PATH))).toBe(false);
  });

  it("owns a newly recreated file after the original user file was deleted", () => {
    configure({ model: "user/model" });
    install();
    rmSync(join(root, OPENCODE_CONFIG_PATH));
    install();
    uninstallCommand({ targetDir: root });
    expect(existsSync(join(root, OPENCODE_CONFIG_PATH))).toBe(false);
  });

  it("preserves later user settings and changes to an installed MCP", () => {
    install();
    const edited = { ...generated, enabled: false };
    configure({ ...readConfig(), model: "user/model", mcp: { context7: edited } });
    const result = install();
    expect(result.warnings.join(" ")).toContain("preserved modified");
    expect(readConfig().mcp?.context7).toEqual(edited);
    uninstallCommand({ targetDir: root });
    expect(readConfig()).toEqual({ model: "user/model", mcp: { context7: edited } });
  });

  it("removes an untouched managed MCP while keeping settings added after installation", () => {
    install();
    configure({ ...readConfig(), permission: { bash: "deny" } });
    install(false);
    expect(readConfig()).toEqual({ permission: { bash: "deny" } });
  });

  it("preserves an originally empty MCP object and custom schema", () => {
    const original = { mcp: {}, $schema: "https://example.invalid/schema" };
    configure(original);
    install();
    uninstallCommand({ targetDir: root });
    expect(readConfig()).toEqual(original);
  });

  it.each(["init", "uninstall"])("keeps legacy v4 shared configuration during %s", (operation) => {
    configure({ model: "user/model", mcp: { context7: generated } });
    writeFileSync(
      join(root, MANIFEST_FILENAME),
      JSON.stringify({
        version: "4",
        engines: ["opencode"],
        renderedAt: new Date().toISOString(),
        files: [OPENCODE_CONFIG_PATH],
      }),
    );
    const before = readFileSync(join(root, OPENCODE_CONFIG_PATH), "utf8");
    const result = operation === "init" ? install(false) : uninstallCommand({ targetDir: root });
    expect(readFileSync(join(root, OPENCODE_CONFIG_PATH), "utf8")).toBe(before);
    expect(result.warnings.join(" ")).toContain("legacy shared configuration");
  });

  it("migrates a legacy v4 config without claiming existing entries", () => {
    configure({ model: "user/model", mcp: { context7: generated } });
    writeFileSync(
      join(root, MANIFEST_FILENAME),
      JSON.stringify({
        version: "4",
        engines: ["opencode"],
        renderedAt: new Date().toISOString(),
        files: [OPENCODE_CONFIG_PATH],
      }),
    );
    install();
    expect(readManifest(root)?.version).toBe("6");
    expect(readManifest(root)?.opencodeConfig).toBeUndefined();
    uninstallCommand({ targetDir: root });
    expect(readConfig()).toEqual({ model: "user/model", mcp: { context7: generated } });
  });

  it.each(["{broken", "null", "[]", '{"mcp":null}', '{"mcp":[]}'])(
    "rejects invalid configuration before removing files: %s",
    (content) => {
      install();
      writeFileSync(join(root, OPENCODE_CONFIG_PATH), content);
      const manifest = readFileSync(join(root, MANIFEST_FILENAME), "utf8");
      expect(() => install(false)).toThrow(/invalid.*opencode/);
      expect(() => uninstallCommand({ targetDir: root })).toThrow(/invalid.*opencode/);
      expect(readFileSync(join(root, MANIFEST_FILENAME), "utf8")).toBe(manifest);
      expect(existsSync(join(root, ".opencode/agents/review.md"))).toBe(true);
      expect(readFileSync(join(root, OPENCODE_CONFIG_PATH), "utf8")).toBe(content);
    },
  );
});
