import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ADDABLE_PILLARS, type PillarId, getPillar, isPillarActive } from "../pillars.js";
import { MANIFEST_FILENAME } from "./manifest.js";
import { defaultPackageDir } from "./plan-render.js";
import { type UpdateResult, updateCommand } from "./update.js";

export interface AddArgs {
  targetDir: string;
  pillar: string;
  /** Directory holding the harness content (`templates/`); defaults to the package's own. */
  packageDir?: string;
  overridesDir?: string;
  /** Exact new backup directory for the re-render, outside the project. */
  backupDir?: string;
}

export interface AddResult {
  pillar: PillarId;
  /** False when the pillar's folder already existed. */
  activated: boolean;
  /** Starter files written; an existing file is never overwritten. */
  filesCreated: string[];
  /** The re-render, absent when the project has no installation yet. */
  update?: UpdateResult;
  /** What to do next, for the operator or the agent. */
  next: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** Every component from the target down to `path` is a real folder or does not exist yet. */
function assertPlainPath(root: string, path: string): void {
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    const info = lstatSync(current, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isSymbolicLink()) throw new Error(`symbolic link in pillar path: ${path}`);
  }
}

/**
 * Activates a pillar (docs/spec/coding-agent-harness.md §9.1.2): creates its
 * folder, writes its starter files without overwriting anything, then
 * re-renders the installation so the pillar's skill, command and umbrella
 * lines appear. The folder is the switch: nothing else records the pillar.
 */
export function addCommand(args: AddArgs): AddResult {
  const root = resolve(args.targetDir);
  const addable = ADDABLE_PILLARS.map((p) => p.id).join(", ");
  const pillar = getPillar(args.pillar);
  if (!pillar) throw new Error(`unknown pillar: ${args.pillar} (expected one of ${addable})`);
  if (pillar.core) throw new Error(`the ${pillar.id} pillar is always active: nothing to add`);
  if (!pillar.dir || pillar.starters === undefined) {
    throw new Error(
      `the ${pillar.id} pillar is not added: drop a file into ${pillar.dir}/ and run \`update\` (addable: ${addable})`,
    );
  }
  if (!existsSync(root)) throw new Error(`target directory does not exist: ${root}`);

  const activated = !isPillarActive(root, pillar.id);
  assertPlainPath(root, pillar.dir);
  for (const starter of pillar.starters) assertPlainPath(root, starter.path);

  const templatesDir = join(args.packageDir ?? defaultPackageDir(), "templates");
  const filesCreated: string[] = [];
  mkdirSync(join(root, pillar.dir), { recursive: true });
  for (const starter of pillar.starters) {
    const destination = join(root, starter.path);
    if (existsSync(destination)) continue;
    const content = readFileSync(join(templatesDir, starter.template), "utf8");
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content.replaceAll("<DATE>", today()));
    filesCreated.push(starter.path);
  }

  const next = pillar.next ?? "";
  if (!existsSync(join(root, MANIFEST_FILENAME))) {
    return {
      pillar: pillar.id,
      activated,
      filesCreated,
      next: `run \`npx @vaubaan/harness init . --engines=<list>\` to render the harness, then ${next}`,
    };
  }
  const update = updateCommand({
    targetDir: root,
    ...(args.packageDir ? { packageDir: args.packageDir } : {}),
    ...(args.overridesDir ? { overridesDir: args.overridesDir } : {}),
    ...(args.backupDir ? { backupDir: args.backupDir } : {}),
  });
  return { pillar: pillar.id, activated, filesCreated, update, next };
}
