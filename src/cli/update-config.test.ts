import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeManifest } from "./manifest.js";
import { uninstallCommand } from "./uninstall.js";
import { type ConfigMutations, planHookConfigCleanup, planUpdateConfigs } from "./update-config.js";

let root: string;
const CODEX_HOOK = ".codex/hooks.json";
const CLAUDE_HOOK = ".claude/settings.json";
const NATIVE_MCP = ".opencode/opencode.json";
const LEGACY_MCP = ".opencode/mcp.json";
const codexCommand = {
  type: "command",
  command: "npx -y @vaubaan/harness stop-hook --engine codex",
};
const claudeCommand = {
  type: "command",
  command: "npx -y @vaubaan/harness stop-hook --engine claude",
};
const context7 = { type: "local", command: ["npx", "-y", "@upstash/context7-mcp"] };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-update-config-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function configure(path: string, value: unknown): void {
  write(path, `${JSON.stringify(value)}\n`);
}

function contents(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function apply(plan: ConfigMutations): void {
  for (const path of plan.removals) rmSync(join(root, path));
  for (const file of plan.writes) write(file.path, file.content);
}

describe("update MCP configuration", () => {
  it("leaves existing native MCP files byte-identical without adding servers", () => {
    const files = {
      ".mcp.json": '{ "mcpServers": {"personal": {"command":"private-mcp"}} }\n',
      ".codex/config.toml": '# user config\nmodel = "custom/model"\n',
      [NATIVE_MCP]: '{ "permission": {"edit":"deny"}, "mcp": {} }\n',
    };
    for (const [path, text] of Object.entries(files)) write(path, text);
    const plan = planUpdateConfigs(root, { files: Object.keys(files) }, []);
    expect(plan.writes).toEqual([]);
    expect(plan.removals).toEqual([]);
    expect(plan.ownedFiles).toEqual([]);
    for (const [path, text] of Object.entries(files)) expect(contents(path)).toBe(text);
  });

  it("migrates legacy MCP entries while preserving native settings and name collisions", () => {
    const native = {
      permission: { edit: "deny" },
      mcp: { personal: { type: "remote", url: "https://example.invalid/mcp" } },
    };
    configure(NATIVE_MCP, native);
    configure(LEGACY_MCP, { mcp: { context7, personal: { type: "local", command: ["old"] } } });
    const plan = planUpdateConfigs(root, { files: [LEGACY_MCP] }, []);
    expect(plan.removals).toEqual([LEGACY_MCP]);
    expect(plan.opencodeConfig?.entries).toEqual({ context7 });
    expect(plan.warnings.join(" ")).toContain("preserved existing OpenCode MCP server");
    apply(plan);
    expect(JSON.parse(contents(NATIVE_MCP))).toMatchObject({
      ...native,
      mcp: { ...native.mcp, context7 },
    });
  });

  it("owns additions when migrating into a missing native config", () => {
    configure(LEGACY_MCP, { mcp: { context7 } });
    const plan = planUpdateConfigs(root, { files: [LEGACY_MCP] }, []);
    expect(plan.opencodeConfig?.createdFile).toBe(true);
    expect(plan.opencodeConfig?.entries).toEqual({ context7 });
    expect(plan.writes.map((file) => file.path)).toEqual([NATIVE_MCP]);
  });

  it("leaves an untracked legacy file alone without claiming or migrating its servers", () => {
    configure(LEGACY_MCP, { mcp: { context7 } });
    const plan = planUpdateConfigs(root, { files: [] }, []);
    expect(plan.removals).toEqual([]);
    expect(plan.writes).toEqual([]);
    expect(plan.opencodeConfig).toBeUndefined();
  });

  it("retains previous native ownership while claiming only new legacy additions", () => {
    const existing = { type: "local", command: ["existing"] };
    configure(NATIVE_MCP, { mcp: { existing } });
    configure(LEGACY_MCP, { mcp: { context7 } });
    const previous = {
      createdFile: true,
      addedMcp: true,
      addedSchema: false,
      entries: { existing },
    };
    const plan = planUpdateConfigs(root, { files: [LEGACY_MCP], opencodeConfig: previous }, []);
    expect(plan.opencodeConfig).toMatchObject({
      createdFile: true,
      addedMcp: true,
      entries: { existing, context7 },
    });
  });

  it.each(["{broken", "null", '{"mcp":[]}'])(
    "rejects invalid legacy configuration before modifying anything: %s",
    (invalid) => {
      write(LEGACY_MCP, invalid);
      configure(NATIVE_MCP, { model: "private/model" });
      const before = contents(NATIVE_MCP);
      expect(() => planUpdateConfigs(root, { files: [LEGACY_MCP] }, [])).toThrow();
      expect(contents(LEGACY_MCP)).toBe(invalid);
      expect(contents(NATIVE_MCP)).toBe(before);
    },
  );
});

describe("update shared Stop hooks", () => {
  it.each([{ hooks: [codexCommand] }, codexCommand])(
    "does not claim, change or duplicate an existing untracked harness command: %j",
    (group) => {
      configure(CODEX_HOOK, { custom: "keep", hooks: { Stop: [group] } });
      const before = contents(CODEX_HOOK);
      const plan = planUpdateConfigs(root, { files: [] }, ["codex-cli"]);
      expect(plan.writes).toEqual([]);
      expect(plan.hookConfigs).toBeUndefined();
      expect(contents(CODEX_HOOK)).toBe(before);
    },
  );

  it("corrects only the known flat Codex entry, preserving user commands and other events", () => {
    const user = { type: "command", command: "custom-stop", timeout: 30 };
    const oldHarness = { ...codexCommand, timeout: 60 };
    configure(CODEX_HOOK, {
      custom: "keep",
      hooks: { Stop: [oldHarness, user], SessionStart: [user] },
    });
    const plan = planUpdateConfigs(root, { files: [CODEX_HOOK] }, ["codex-cli"]);
    expect(plan.ownedFiles).not.toContain(CODEX_HOOK);
    apply(plan);
    expect(JSON.parse(contents(CODEX_HOOK))).toEqual({
      custom: "keep",
      hooks: { Stop: [{ hooks: [oldHarness] }, user], SessionStart: [user] },
    });
    expect(plan.hookConfigs?.[CODEX_HOOK]?.entries).toEqual([{ group: {}, hook: oldHarness }]);
  });

  it("keeps an already native mixed group byte-identical and removes only its harness command", () => {
    const user = { type: "command", command: "personal-stop" };
    const config = {
      permissions: { deny: ["Read(.env)"] },
      hooks: { Stop: [{ matcher: "", custom: true, hooks: [user, claudeCommand] }] },
    };
    configure(CLAUDE_HOOK, config);
    const before = contents(CLAUDE_HOOK);
    const plan = planUpdateConfigs(root, { files: [CLAUDE_HOOK] }, ["claude-code"]);
    expect(plan.writes).toEqual([]);
    expect(contents(CLAUDE_HOOK)).toBe(before);
    apply(planHookConfigCleanup(root, plan.hookConfigs));
    expect(JSON.parse(contents(CLAUDE_HOOK))).toEqual({
      ...config,
      hooks: { Stop: [{ matcher: "", custom: true, hooks: [user] }] },
    });
  });

  it("adds one native hook and owns only its shared entry", () => {
    const plan = planUpdateConfigs(root, { files: [] }, ["codex-cli"]);
    expect(plan.writes.map((file) => file.path)).toEqual([CODEX_HOOK]);
    expect(plan.ownedFiles).toEqual([]);
    expect(plan.hookConfigs?.[CODEX_HOOK]?.createdFile).toBe(true);
    apply(plan);
    const repeated = planUpdateConfigs(root, { files: [], hookConfigs: plan.hookConfigs }, [
      "codex-cli",
    ]);
    expect(repeated.writes).toEqual([]);
    expect(repeated.hookConfigs).toEqual(plan.hookConfigs);
    expect(planHookConfigCleanup(root, repeated.hookConfigs).removals).toEqual([CODEX_HOOK]);
  });

  it.each([{}, { hooks: {} }, { hooks: { Stop: [] } }])(
    "restores existing empty user containers after cleanup: %j",
    (original) => {
      configure(CODEX_HOOK, original);
      const plan = planUpdateConfigs(root, { files: [] }, ["codex-cli"]);
      apply(plan);
      const cleanup = planHookConfigCleanup(root, plan.hookConfigs);
      expect(cleanup.removals).toEqual([]);
      apply(cleanup);
      expect(JSON.parse(contents(CODEX_HOOK))).toEqual(original);
    },
  );

  it.each([
    { hooks: [{ ...codexCommand, timeout: 999 }] },
    { matcher: "custom", hooks: [codexCommand] },
    { hooks: [{ type: "command", command: "my-custom-harness-wrapper" }] },
  ])("preserves edits during repeated updates and uninstall: %j", (edited) => {
    const first = planUpdateConfigs(root, { files: [] }, ["codex-cli"]);
    apply(first);
    configure(CODEX_HOOK, { hooks: { Stop: [edited] } });
    const before = contents(CODEX_HOOK);
    const second = planUpdateConfigs(root, { files: [], hookConfigs: first.hookConfigs }, [
      "codex-cli",
    ]);
    expect(second.writes).toEqual([]);
    expect(second.warnings.join(" ")).toContain("modified harness Stop hook");
    const third = planUpdateConfigs(root, { files: [], hookConfigs: second.hookConfigs }, [
      "codex-cli",
    ]);
    expect(third.writes).toEqual([]);
    const cleanup = planHookConfigCleanup(root, third.hookConfigs);
    expect(cleanup.writes).toEqual([]);
    expect(cleanup.removals).toEqual([]);
    expect(contents(CODEX_HOOK)).toBe(before);
  });

  it("does not recreate a hook file explicitly removed after its installation", () => {
    const first = planUpdateConfigs(root, { files: [] }, ["codex-cli"]);
    apply(first);
    rmSync(join(root, CODEX_HOOK));
    const repeated = planUpdateConfigs(root, { files: [], hookConfigs: first.hookConfigs }, [
      "codex-cli",
    ]);
    expect(repeated.writes).toEqual([]);
    expect(existsSync(join(root, CODEX_HOOK))).toBe(false);
  });

  it("removes unchanged owned entries when hooks are disabled", () => {
    const first = planUpdateConfigs(root, { files: [] }, ["codex-cli"]);
    apply(first);
    const disabled = planUpdateConfigs(root, { files: [], hookConfigs: first.hookConfigs }, []);
    expect(disabled.removals).toEqual([CODEX_HOOK]);
    expect(disabled.hookConfigs).toBeUndefined();
  });

  it.each(["{broken", "null", '{"hooks":null}', '{"hooks":{"Stop":{}}}'])(
    "rejects invalid hooks before writing anything: %s",
    (invalid) => {
      write(CODEX_HOOK, invalid);
      expect(() => planUpdateConfigs(root, { files: [] }, ["codex-cli"])).toThrow();
      expect(contents(CODEX_HOOK)).toBe(invalid);
    },
  );

  it("rejects a symbolic hook destination", () => {
    write("outside.json", "{}");
    mkdirSync(join(root, ".codex"));
    symlinkSync(join(root, "outside.json"), join(root, CODEX_HOOK));
    expect(() => planUpdateConfigs(root, { files: [] }, ["codex-cli"])).toThrow(/symbolic link/);
  });

  it("owns the OpenCode plugin as a regular generated file", () => {
    const plan = planUpdateConfigs(root, { files: [] }, ["opencode"]);
    expect(plan.ownedFiles).toEqual([".opencode/plugins/harness-stop-hook.ts"]);
    expect(plan.writes.map((file) => file.path)).toEqual(plan.ownedFiles);
    expect(plan.hookConfigs).toBeUndefined();
  });
});

describe("uninstall shared hook ownership", () => {
  it("retains a private setting while removing the harness entry", () => {
    configure(CLAUDE_HOOK, { permissions: { deny: ["Read(.env)"] } });
    const plan = planUpdateConfigs(root, { files: [] }, ["claude-code"]);
    apply(plan);
    write("AGENTS.md", "managed");
    writeManifest(root, ["claude-code"], ["AGENTS.md"], { hookConfigs: plan.hookConfigs });
    uninstallCommand({ targetDir: root });
    expect(JSON.parse(contents(CLAUDE_HOOK))).toEqual({ permissions: { deny: ["Read(.env)"] } });
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });

  it("rejects invalid shared hooks before deleting a regular managed file", () => {
    const plan = planUpdateConfigs(root, { files: [] }, ["codex-cli"]);
    apply(plan);
    write("AGENTS.md", "keep");
    writeManifest(root, ["codex-cli"], ["AGENTS.md"], { hookConfigs: plan.hookConfigs });
    write(CODEX_HOOK, "{broken");
    expect(() => uninstallCommand({ targetDir: root })).toThrow(/invalid shared configuration/);
    expect(contents("AGENTS.md")).toBe("keep");
    expect(existsSync(join(root, ".harness-manifest.json"))).toBe(true);
  });
});
