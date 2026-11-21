import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The pillars of the meta database (docs/spec/coding-agent-harness.md
 * §9.1.2). README and spec are the core, always active; every other pillar
 * is active when its folder under `docs/` exists
 * (docs/decisions/pillars-on-demand.md).
 */
export const PILLAR_IDS = [
  "readme",
  "spec",
  "decisions",
  "handbook",
  "tests",
  "workflow",
  "quality",
  "skills",
  "intents",
  "profiles",
] as const;
export type PillarId = (typeof PILLAR_IDS)[number];

export interface StarterFile {
  /** Template under the package's `templates/`. */
  template: string;
  /** Destination from the repo root. */
  path: string;
}

export interface Pillar {
  id: PillarId;
  /** Folder from the repo root; the README pillar has none. */
  dir?: string;
  /** Always active: its absence never deactivates anything. */
  core: boolean;
  /** Written by `add`, never over an existing file. Absent: `add` does not apply. */
  starters?: ReadonlyArray<StarterFile>;
  /** What to do once the pillar is added. */
  next?: string;
}

export const PILLARS: ReadonlyArray<Pillar> = [
  { id: "readme", core: true },
  { id: "spec", dir: "docs/spec", core: true },
  {
    id: "decisions",
    dir: "docs/decisions",
    core: false,
    starters: [{ template: "decisions-index.md.tmpl", path: "docs/decisions/README.md" }],
    next: "write the first decision with the `harn-decision-record-writer` skill (`/harn-decision`)",
  },
  {
    id: "handbook",
    dir: "docs/handbook",
    core: false,
    starters: [{ template: "handbook-index.md.tmpl", path: "docs/handbook/README.md" }],
    next: "write the first handbook with the `harn-handbook-writer` skill (`/harn-handbook`)",
  },
  {
    id: "tests",
    dir: "docs/tests",
    core: false,
    starters: [
      { template: "integration-tests.md.tmpl", path: "docs/tests/integration-tests.md" },
      { template: "e2e-tests.md.tmpl", path: "docs/tests/e2e-tests.md" },
    ],
    next: "fill both test plans with the `harn-test-plan-writer` skill (`/harn-test-plan`); the lint fails on their placeholders until then",
  },
  {
    id: "workflow",
    dir: "docs/workflow",
    core: false,
    starters: [{ template: "coding-workflow.md.tmpl", path: "docs/workflow/coding-workflow.md" }],
    next: "fill the workflow with the `harn-workflow-writer` skill (`/harn-workflow`); the lint fails on its placeholders until then",
  },
  {
    id: "quality",
    dir: "docs/quality",
    core: false,
    starters: [{ template: "code-quality.md.tmpl", path: "docs/quality/code-quality.md" }],
    next: "fill docs/quality/code-quality.md by hand: the tools, the project's rules, the accepted deviations",
  },
  // Active as soon as it holds a `*.skill.md`: nothing to add.
  { id: "skills", dir: "docs/skills", core: false },
  {
    id: "intents",
    dir: "docs/intents",
    core: false,
    starters: [],
    next: "write the first intent with the `harn-intent-writer` skill (`/harn-intent <verb + object>`)",
  },
  {
    id: "profiles",
    dir: "docs/profiles",
    core: false,
    starters: [],
    next: "describe the first profile with the `harn-intent-writer` skill, from the research you point it to",
  },
];

/** The pillars `add` accepts. */
export const ADDABLE_PILLARS: ReadonlyArray<Pillar> = PILLARS.filter(
  (pillar) => pillar.starters !== undefined,
);

export function getPillar(id: string): Pillar | undefined {
  return PILLARS.find((pillar) => pillar.id === id);
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** A pillar is active when it is core or when its folder exists. */
export function isPillarActive(repoRoot: string, id: PillarId): boolean {
  const pillar = getPillar(id);
  if (!pillar) return false;
  if (pillar.core) return true;
  return pillar.dir !== undefined && isDirectory(join(repoRoot, pillar.dir));
}

export function activePillars(repoRoot: string): Set<PillarId> {
  return new Set(PILLARS.filter((p) => isPillarActive(repoRoot, p.id)).map((p) => p.id));
}

/** Every pillar: what a preview render shows, with no project to read. */
export function allPillars(): Set<PillarId> {
  return new Set(PILLAR_IDS);
}

/**
 * Pillar folders that exist and hold no file at any depth. Git does not
 * record them, so the pillar would be active on one machine only.
 */
export function emptyPillarDirs(repoRoot: string): string[] {
  const holdsFile = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true }).some((entry) =>
      entry.isDirectory() ? holdsFile(join(dir, entry.name)) : true,
    );
  return PILLARS.flatMap((pillar) => {
    if (!pillar.dir) return [];
    const full = join(repoRoot, pillar.dir);
    return isDirectory(full) && !holdsFile(full) ? [pillar.dir] : [];
  });
}
