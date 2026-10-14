import type { McpServerSpec } from "../mcp.js";
import type { Agent } from "../parser/agent.js";
import type { Cmd } from "../parser/cmd.js";
import type { Skill } from "../parser/skill.js";
import type { Engine } from "../types.js";
import {
  type RenderResult,
  type Renderer,
  STOP_HOOK_PACKAGE,
  buildAgentBody,
  checkSkillCapabilities,
  frontmatterDataForSkill,
  isSkillEngineAllowed,
  yamlFrontmatter,
} from "./common.js";

const ENGINE: Engine = "opencode";
const BASE = ".opencode";

export const opencodeRenderer: Renderer = {
  engine: ENGINE,
  renderSkill(skill: Skill): RenderResult {
    if (!isSkillEngineAllowed(skill, ENGINE)) {
      return {
        files: [],
        warnings: [`skill "${skill.meta.id}" excluded from engine "${ENGINE}"`],
      };
    }
    const check = checkSkillCapabilities(skill, ENGINE);
    if (check.blockingWarnings.length > 0) {
      return { files: [], warnings: check.blockingWarnings };
    }
    const content = `${yamlFrontmatter(frontmatterDataForSkill(skill))}\n${skill.body}\n`;
    return {
      files: [{ path: `${BASE}/skills/${skill.meta.id}/SKILL.md`, content }],
      warnings: check.degradedWarnings,
    };
  },
  renderCmd(cmd: Cmd): RenderResult {
    // OpenCode names the command after the file; only `description` is a known key.
    const content = `${yamlFrontmatter({ description: cmd.meta.description })}\n${cmd.body}\n`;
    return {
      files: [{ path: `${BASE}/commands/${cmd.meta.id}.md`, content }],
      warnings: [],
    };
  },
  renderAgents(agents: ReadonlyArray<Agent>): RenderResult {
    const files = [];
    for (const agent of agents) {
      // The file name is the agent name. `mode: all` keeps each persona usable
      // both as a session's primary agent and as a subagent.
      const fm = yamlFrontmatter({
        description: agent.meta.description,
        mode: "all",
      });
      const body = buildAgentBody(agent);
      files.push({ path: `${BASE}/agents/${agent.meta.id}.md`, content: `${fm}\n${body}` });
    }
    return { files, warnings: [] };
  },
  renderMcp(servers: ReadonlyArray<McpServerSpec>): RenderResult {
    if (servers.length === 0) return { files: [], warnings: [] };
    const mcp: Record<string, Record<string, unknown>> = {};
    for (const s of servers) {
      const entry: Record<string, unknown> = {
        type: "local",
        command: [s.command, ...s.args],
        enabled: true,
      };
      if (s.env) entry.environment = s.env;
      mcp[s.id] = entry;
    }
    const config = { $schema: "https://opencode.ai/config.json", mcp };
    const content = `${JSON.stringify(config, null, 2)}\n`;
    return { files: [{ path: `${BASE}/opencode.json`, content }], warnings: [] };
  },
  renderStopHook(): RenderResult {
    const content = `import { spawnSync } from "node:child_process";

export const HarnessStopHook = async ({ client, directory }) => ({
  event: async ({ event }) => {
    if (event.type !== "session.idle") return;
    const sessionID = event.properties?.sessionID;
    if (!sessionID) return;
    const r = spawnSync(
      "npx",
      ["-y", "${STOP_HOOK_PACKAGE}", "stop-hook", "--engine", "opencode", "--cwd", directory],
      { input: JSON.stringify({ sessionID }), encoding: "utf-8" },
    );
    const report = (r.stderr ?? "").trim();
    if (r.status !== 2 || report === "") return;
    // OpenCode defaults to its build agent when a prompt omits agent.
    // Preserve the last conversation persona, excluding compaction summaries.
    const history = await client.session.messages({ path: { id: sessionID } }).catch(() => undefined);
    if (history?.error || !Array.isArray(history?.data)) return;
    const current = history.data.findLast(({ info }) =>
      (info.role === "user" || (info.role === "assistant" && !info.summary)) &&
      typeof info.agent === "string" && info.agent.trim() !== "",
    );
    if (!current) return;
    await client.session.prompt({
      path: { id: sessionID },
      body: { agent: current.info.agent, parts: [{ type: "text", text: report }] },
    });
  },
});
`;
    return {
      files: [{ path: `${BASE}/plugins/harness-stop-hook.ts`, content }],
      warnings: [],
    };
  },
};
