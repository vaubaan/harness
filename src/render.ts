import type { Cmd } from "./parser/cmd.js";
import type { Skill } from "./parser/skill.js";
import { buildUmbrellaBody } from "./renderers/common.js";
import { getRenderer } from "./renderers/index.js";
import type { Engine, RenderedFile } from "./types.js";

export interface Harness {
  skills: ReadonlyArray<Skill>;
  cmds: ReadonlyArray<Cmd>;
}

export interface HarnessOverrides {
  add?: Partial<Harness>;
  disable?: ReadonlyArray<string>;
}

export interface RenderInput {
  harness: Harness;
  engines: ReadonlyArray<Engine>;
  overrides?: HarnessOverrides;
  projectSkills?: ReadonlyArray<Skill>;
  /** True when the target project ships `docs/quality/code-quality.md` (optional pillar). */
  hasQualityDoc?: boolean;
}

export interface RenderOutput {
  files: RenderedFile[];
  warnings: string[];
}

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
}

function mergeById<T extends { meta: { id: string } }>(
  stock: ReadonlyArray<T>,
  added: ReadonlyArray<T> | undefined,
): T[] {
  const result = new Map<string, T>();
  for (const item of stock) result.set(item.meta.id, item);
  if (added) {
    for (const item of added) result.set(item.meta.id, item);
  }
  return Array.from(result.values());
}

function removeByIds<T extends { meta: { id: string } }>(
  items: ReadonlyArray<T>,
  disabled: ReadonlyArray<string>,
): T[] {
  if (disabled.length === 0) return [...items];
  const disabledSet = new Set(disabled);
  return items.filter((item) => !disabledSet.has(item.meta.id));
}

export function applyOverrides(harness: Harness, overrides: HarnessOverrides | undefined): Harness {
  const disabled = overrides?.disable ?? [];
  return {
    skills: removeByIds(mergeById(harness.skills, overrides?.add?.skills), disabled),
    cmds: removeByIds(mergeById(harness.cmds, overrides?.add?.cmds), disabled),
  };
}

// `@AGENTS.md` is Claude Code's import syntax: the umbrella is really loaded,
// on every version and provider, and never read twice alongside native
// AGENTS.md support (cf. ADR engine-native-layouts-1-0).
const CLAUDE_MD_STUB = "@AGENTS.md\n";

// OpenCode also scans `.claude/skills/` and `.agents/skills/`. It goes last so
// its own copy of a skill is dropped when another rendered engine exposes it.
function opencodeLast(engines: ReadonlyArray<Engine>): Engine[] {
  return [...engines].sort((a, b) => Number(a === "opencode") - Number(b === "opencode"));
}

/**
 * Pure transformation `(catalog, engines, overrides) → files`. The harness
 * ships no agent persona and no engine hook: only the doc skills, their
 * commands, and the engine-neutral umbrella
 * (docs/decisions/no-personas-no-code-judgment.md,
 * docs/decisions/lint-in-ci-and-pre-commit.md).
 */
export function render(input: RenderInput): RenderOutput {
  const { engines } = input;
  if (engines.length === 0) {
    throw new RenderError("at least one engine must be selected");
  }
  const base: Harness = input.projectSkills?.length
    ? { ...input.harness, skills: mergeById(input.harness.skills, input.projectSkills) }
    : input.harness;
  const harness = applyOverrides(base, input.overrides);

  const files: RenderedFile[] = [];
  const warnings: string[] = [];

  // Track skills + commands successfully exposed on at least one engine,
  // for the engine-neutral umbrella's "Doc-skills" section.
  const exposedSkills = new Map<string, Skill>();
  const exposedCmds = new Map<string, Cmd>();

  for (const engine of opencodeLast(engines)) {
    const renderer = getRenderer(engine);

    const renderedSkillIds = new Set<string>();
    for (const skill of harness.skills) {
      const result = renderer.renderSkill(skill);
      warnings.push(...result.warnings);
      if (result.files.length > 0) {
        const alreadyVisible = engine === "opencode" && exposedSkills.has(skill.meta.id);
        if (!alreadyVisible) files.push(...result.files);
        renderedSkillIds.add(skill.meta.id);
        exposedSkills.set(skill.meta.id, skill);
      }
    }

    for (const cmd of harness.cmds) {
      if (!renderedSkillIds.has(cmd.meta.invokes_skill)) continue;
      const result = renderer.renderCmd(cmd);
      warnings.push(...result.warnings);
      if (result.files.length > 0) {
        files.push(...result.files);
        exposedCmds.set(cmd.meta.id, cmd);
      }
    }
  }

  // Engine-neutral umbrella at the root
  const umbrellaContent = buildUmbrellaBody({
    availableSkills: Array.from(exposedSkills.values()),
    availableCommands: Array.from(exposedCmds.values()),
    hasProjectSkills: (input.projectSkills?.length ?? 0) > 0,
    hasQualityDoc: input.hasQualityDoc === true,
  });
  files.push({ path: "AGENTS.md", content: umbrellaContent });

  // CLAUDE.md stub only if claude-code is enabled (Claude Code reads it historically)
  if (engines.includes("claude-code")) {
    files.push({ path: "CLAUDE.md", content: CLAUDE_MD_STUB });
  }

  return { files, warnings };
}
