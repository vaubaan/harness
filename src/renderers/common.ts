import { stringify as yamlStringify } from "yaml";
import type { Agent } from "../parser/agent.js";
import type { Cmd } from "../parser/cmd.js";
import type { Skill } from "../parser/skill.js";
import {
  CAPABILITIES_MATRIX,
  type Capability,
  DEGRADED_CAPABILITIES,
  type Engine,
  type RenderedFile,
} from "../types.js";

export interface UmbrellaExtras {
  availableSkills: ReadonlyArray<Skill>;
  availableCommands: ReadonlyArray<Cmd>;
  hasProjectSkills?: boolean;
  hasQualityDoc?: boolean;
}

export interface RenderResult {
  files: RenderedFile[];
  warnings: string[];
}

export interface Renderer {
  readonly engine: Engine;
  renderSkill(skill: Skill): RenderResult;
  renderCmd(cmd: Cmd): RenderResult;
  renderAgents(agents: ReadonlyArray<Agent>): RenderResult;
  renderStopHook(): RenderResult;
}

export const STOP_HOOK_PACKAGE = "@vaubaan/harness";

export interface CapabilityCheck {
  blockingWarnings: string[];
  degradedWarnings: string[];
}

export function checkSkillCapabilities(skill: Skill, engine: Engine): CapabilityCheck {
  const blockingWarnings: string[] = [];
  const degradedWarnings: string[] = [];
  const supported = CAPABILITIES_MATRIX[engine];
  const degraded = DEGRADED_CAPABILITIES[engine] ?? [];
  if (!skill.meta.requires) return { blockingWarnings, degradedWarnings };
  for (const cap of skill.meta.requires) {
    if (!supported.includes(cap as Capability)) {
      blockingWarnings.push(
        `skill "${skill.meta.id}" requires "${cap}" not supported by "${engine}" — skipped`,
      );
    } else if (degraded.includes(cap as Capability)) {
      degradedWarnings.push(
        `skill "${skill.meta.id}" requires "${cap}" — supported by "${engine}" with degradation`,
      );
    }
  }
  return { blockingWarnings, degradedWarnings };
}

export function isSkillEngineAllowed(skill: Skill, engine: Engine): boolean {
  if (!skill.meta.engines) return true;
  return skill.meta.engines.includes(engine);
}

export function yamlFrontmatter(data: Record<string, unknown>): string {
  const rendered = yamlStringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${rendered}\n---\n`;
}

const SCALAR_NEEDS_QUOTE = /[^a-zA-Z0-9_./-]/;

function tomlEscapeString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function tomlValue(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map((x) => tomlValue(x)).join(", ")}]`;
  }
  if (typeof v === "string") {
    if (v.includes("\n")) return tomlEscapeString(v);
    return SCALAR_NEEDS_QUOTE.test(v) ? tomlEscapeString(v) : `"${v}"`;
  }
  if (typeof v === "boolean" || typeof v === "number") {
    return String(v);
  }
  return tomlEscapeString(String(v));
}

/** TOML multi-line basic string (`"""…"""`), used for Codex `developer_instructions`. */
export function tomlMultilineString(s: string): string {
  const escaped = s.replace(/\\/g, "\\\\").replace(/"""/g, '""\\"');
  return `"""\n${escaped}\n"""`;
}

export function tomlQuoteString(s: string): string {
  return tomlValue(s);
}

export function frontmatterDataForSkill(skill: Skill): Record<string, unknown> {
  // Agent Skills spec (agentskills.io): `name` must match the directory name.
  const data: Record<string, unknown> = {
    name: skill.meta.id,
    description: skill.meta.description,
  };
  if (skill.meta.tags && skill.meta.tags.length > 0) data.tags = skill.meta.tags;
  return data;
}

export function frontmatterDataForCmd(cmd: Cmd): Record<string, unknown> {
  const data: Record<string, unknown> = {
    id: cmd.meta.id,
    trigger: cmd.meta.trigger,
    description: cmd.meta.description,
  };
  if (cmd.meta.args && cmd.meta.args.length > 0) {
    data.args = cmd.meta.args.map((a) => {
      if (a.type === "enum") {
        return a.default !== undefined
          ? { name: a.name, type: a.type, values: a.values, default: a.default }
          : { name: a.name, type: a.type, values: a.values };
      }
      return a.default !== undefined
        ? { name: a.name, type: a.type, default: a.default }
        : { name: a.name, type: a.type };
    });
  }
  return data;
}

/**
 * Personas carry their role contract only: engines discover skills and
 * commands natively, so listing them per persona is pure context cost.
 */
export function buildAgentBody(agent: Agent): string {
  return `${agent.body.trim()}\n`;
}

export function buildUmbrellaBody(_agents: ReadonlyArray<Agent>, extras: UmbrellaExtras): string {
  const triggerBySkill = new Map(
    extras.availableCommands.map((c) => [c.meta.invokes_skill, c.meta.trigger]),
  );
  const skillLines = extras.availableSkills.map((s) => {
    const trigger = triggerBySkill.get(s.meta.id);
    const label = trigger ? `\`${s.meta.id}\` (\`${trigger}\`)` : `\`${s.meta.id}\``;
    return `- ${label} — ${s.meta.description.split("\n")[0]}`;
  });
  const sections: string[] = [
    "# How we work",
    "",
    "This file describes **how to work in this project**. The **business context** (what the project does, how to run it, which subsystems it contains) lives in `README.md` and `docs/`. Read them first.",
    "",
    "## Project map",
    "",
    "- `README.md` — pitch, quick start, scripts. Entry point.",
    "- `docs/spec/<subsystem>.md` — *what* and *why* (tech-agnostic).",
    "- `docs/handbook/<feature>.md` — *how it actually works* today.",
    "- `docs/decisions/<slug>.md` — ADRs: structural choices and rejected alternatives.",
    "- `docs/tests/integration-tests.md` & `e2e-tests.md` — core scenarios.",
    "- `docs/workflow/coding-workflow.md` — CI, branches, PR, release.",
    ...(extras.hasProjectSkills
      ? ["- `docs/skills/*.skill.md` — the project's domain skills."]
      : []),
    ...(extras.hasQualityDoc
      ? [
          "- `docs/quality/code-quality.md` — the project's code-quality rules: mechanical checks, judgment rules, accepted deviations. Read it before writing or auditing code.",
        ]
      : []),
    "",
    "## Doc-first",
    "",
    "The order is: **understand the docs → fill the gaps → code → update the docs → commit**. If the docs are silent or stale on something you change, fill the gap upfront with the doc-skill writers — not downstream, not after the fact.",
    "",
    "- Missing spec for a subsystem you touch → **do not code**, report the gap.",
    "- Implicit structural decision in your changes → an ADR (`/decision`).",
    "- Changed feature behavior → update the matching handbook (`/handbook`).",
    "- Suspected code ↔ doc drift → `/drift` before moving on.",
  ];
  if (skillLines.length > 0) {
    sections.push("", "## Doc-skills", "", skillLines.join("\n"));
  }
  return `${sections.join("\n")}\n`;
}
