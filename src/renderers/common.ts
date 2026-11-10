import { stringify as yamlStringify } from "yaml";
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
  hasIntents?: boolean;
}

export interface RenderResult {
  files: RenderedFile[];
  warnings: string[];
}

export interface Renderer {
  readonly engine: Engine;
  renderSkill(skill: Skill): RenderResult;
  renderCmd(cmd: Cmd): RenderResult;
}

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
    // `required` is rendered only when false: an argument is required by default.
    data.args = cmd.meta.args.map((a) => ({
      name: a.name,
      type: a.type,
      ...(a.type === "enum" ? { values: a.values } : {}),
      ...(a.default !== undefined ? { default: a.default } : {}),
      ...(a.required === false ? { required: false } : {}),
    }));
  }
  return data;
}

/**
 * The engine-neutral umbrella: the one working rule the harness imposes,
 * the project map, the checks, and the doc skills the engines expose.
 * Everything project-specific lives in `README.md` and `docs/`.
 */
export function buildUmbrellaBody(extras: UmbrellaExtras): string {
  // One skill may be invoked by several commands: list every trigger, in
  // command order.
  const triggersBySkill = new Map<string, string[]>();
  for (const c of extras.availableCommands) {
    const triggers = triggersBySkill.get(c.meta.invokes_skill) ?? [];
    triggers.push(c.meta.trigger);
    triggersBySkill.set(c.meta.invokes_skill, triggers);
  }
  const skillLines = extras.availableSkills.map((s) => {
    const triggers = triggersBySkill.get(s.meta.id) ?? [];
    const label =
      triggers.length > 0
        ? `\`${s.meta.id}\` (${triggers.map((t) => `\`${t}\``).join(", ")})`
        : `\`${s.meta.id}\``;
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
    "- `docs/handbook/<feature>.md` — what the code does not say: entry points, traps, settings outside the repo, manual procedures.",
    "- `docs/decisions/<slug>.md` — ADRs: structural choices and rejected alternatives.",
    "- `docs/tests/integration-tests.md` & `e2e-tests.md` — test scope, stack, conventions, known gaps.",
    "- `docs/workflow/coding-workflow.md` — CI, branches, PR, release. How this team works: follow it.",
    ...(extras.hasProjectSkills
      ? ["- `docs/skills/*.skill.md` — the project's domain skills."]
      : []),
    ...(extras.hasQualityDoc
      ? [
          "- `docs/quality/code-quality.md` — the project's code-quality rules: mechanical checks, judgment rules, accepted deviations. Read it before writing or auditing code.",
        ]
      : []),
    ...(extras.hasIntents
      ? [
          "- `docs/intents/<intent>.md` — user intents, one tree per level-1 intent, anchored to the code. `docs/intents/README.md` is the generated index.",
        ]
      : []),
    "",
    "## Doc-first",
    "",
    "The order is: **understand the docs → fill the gaps → code → update the docs → commit**. If the docs are silent or stale on something you change, fill the gap upfront with the doc-skill writers — not downstream, not after the fact.",
    "",
    ...(extras.hasIntents
      ? [
          "- Visible change of behavior → a `proposed` intent first (`/intent <verb + object>`), never the code first.",
        ]
      : []),
    "- Missing spec for a subsystem you touch → **do not code**, report the gap.",
    "- Implicit structural decision in your changes → an ADR (`/decision`).",
    "- Changed feature behavior → update the matching handbook (`/handbook`).",
    "- Suspected code ↔ doc drift → `/drift` before moving on.",
    "",
    "## Checks",
    "",
    "Run `npx @vaubaan/harness lint` before you commit; CI runs the same linters on every pull request. Fix what it reports with the skill it suggests.",
    "",
    "The files the harness generates (`AGENTS.md`, `CLAUDE.md`, the `.claude/`, `.agents/` and `.opencode/` folders, `.harness-manifest.json`) are committed. Never edit them by hand: change their source in `docs/` or `.harness-overrides/`, run `npx @vaubaan/harness update .`, and commit the result. The linter fails when a generated file no longer matches its render.",
  ];
  if (skillLines.length > 0) {
    sections.push("", "## Doc-skills", "", skillLines.join("\n"));
  }
  return `${sections.join("\n")}\n`;
}
