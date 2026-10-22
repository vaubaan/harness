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
  renderStopHook(): RenderResult {
    const content = `import { spawnSync } from "node:child_process";

// Runs the harness lint and returns the report to inject, or "" when the
// turn may end.
const lintReport = (directory, sessionID) => {
  const r = spawnSync(
    "npx",
    ["-y", "${STOP_HOOK_PACKAGE}", "stop-hook", "--engine", "opencode", "--cwd", directory],
    { input: JSON.stringify({ sessionID }), encoding: "utf-8" },
  );
  const report = (r.stderr ?? "").trim();
  return r.status === 2 ? report : "";
};

// OpenCode 1.x entry point, exposed as server() below.
const HarnessStopHook = async ({ client, directory }) => ({
  event: async ({ event }) => {
    if (event.type !== "session.idle") return;
    const sessionID = event.properties?.sessionID;
    if (!sessionID) return;
    const report = lintReport(directory, sessionID);
    if (report === "") return;
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

// One default export for both majors: OpenCode 1.x calls server(),
// OpenCode 2.x calls setup(). A V2 session keeps its agent, so the report
// is sent without naming the persona.
export default {
  id: "vaubaan-harness-stop-hook",
  server: HarnessStopHook,
  setup(context) {
    const directory = context.location.directory;
    const controller = new AbortController();
    const listen = async () => {
      for await (const event of context.event.subscribe({ signal: controller.signal })) {
        if (event.type !== "session.idle") continue;
        if (event.location?.directory && event.location.directory !== directory) continue;
        const sessionID = event.data?.sessionID;
        if (!sessionID) continue;
        const report = lintReport(directory, sessionID);
        if (report === "") continue;
        await context.session.prompt({ sessionID, text: report }).catch(() => undefined);
      }
    };
    listen().catch(() => undefined);
    return () => controller.abort();
  },
};
`;
    return {
      files: [{ path: `${BASE}/plugins/harness-stop-hook.ts`, content }],
      warnings: [],
    };
  },
};
