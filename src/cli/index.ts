#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { formatReportText, runLinters } from "../linters/index.js";
import { VERSION } from "../version.js";
import { checkCommand } from "./check.js";
import { initCommand } from "./init.js";
import { renderCommand } from "./render.js";
import { uninstallCommand } from "./uninstall.js";
import { updateCommand } from "./update.js";

function resolvePackageDir(): string {
  // CLI lives at <contentRoot>/cli/index.{ts,js}.
  // In dev <contentRoot> = src/ ; in prod (after tsup + copy) = dist/.
  // Both contain skills/, commands/, templates/ as siblings of cli/.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

/** Comma-separated option value; an option given empty yields an empty list. */
function parseList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const ENGINES_HELP = "comma-separated engines to render: claude-code, codex-cli, opencode";

const program = new Command();

program
  .name("vaubaan-harness")
  .description(
    "Vaubaan harness — keep a project's docs alive: render the doc skills into each engine's native layout, lint the docs in CI",
  )
  .version(VERSION);

program
  .command("init")
  .description(
    "Render the harness (doc skills, commands, AGENTS.md) into a project. Commit the result.",
  )
  .argument("<target-dir>", "directory to render harness into")
  .requiredOption("--engines <list>", ENGINES_HELP)
  .option("--overrides-dir <dir>", "directory containing .harness-overrides/")
  .option("--package-dir <dir>", "override harness package directory (for dev/test)")
  .option("--preserve <paths>", "comma-separated generated files to leave under user ownership")
  .option("--backup-dir <dir>", "new backup directory outside the project")
  .action((targetDir: string, opts: Record<string, string | boolean | undefined>) => {
    const packageDir = (opts.packageDir as string | undefined) ?? resolvePackageDir();
    const result = initCommand({
      targetDir,
      engines: parseList(opts.engines as string | undefined) ?? [],
      overridesDir: opts.overridesDir as string | undefined,
      packageDir,
      preserveFiles: parseList(opts.preserve as string | undefined),
      backupDir: opts.backupDir as string | undefined,
    });
    process.stdout.write(`rendered ${result.filesWritten.length} files to ${targetDir}\n`);
    if (result.staleFilesRemoved.length > 0) {
      process.stdout.write(
        `removed ${result.staleFilesRemoved.length} stale files from a previous render\n`,
      );
    }
    if (result.backupDir) process.stdout.write(`backup: ${result.backupDir}\n`);
    for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
    process.stdout.write(
      "next: commit the generated files, then run `npx @vaubaan/harness lint` before each commit (add it to your pre-commit hook and CI)\n",
    );
  });

program
  .command("update")
  .description("Re-render an existing installation with this version, keeping its engines")
  .argument("[target-dir]", "project directory", ".")
  .option("--dry-run", "preview changes without writing files or backups")
  .option("--json", "print the migration summary as JSON")
  .option("--backup-dir <dir>", "new backup directory outside the project")
  .option("--overrides-dir <dir>", "directory containing .harness-overrides/")
  .option("--preserve <paths>", "comma-separated generated files to leave under user ownership")
  .action((targetDir: string, opts: Record<string, string | boolean | undefined>) => {
    const result = updateCommand({
      targetDir,
      packageDir: resolvePackageDir(),
      dryRun: opts.dryRun === true,
      backupDir: opts.backupDir as string | undefined,
      overridesDir: opts.overridesDir as string | undefined,
      preserveFiles: (opts.preserve as string | undefined)?.split(",").map((path) => path.trim()),
    });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    if (result.upToDate) process.stdout.write(`harness ${VERSION}: already up to date\n`);
    else
      process.stdout.write(
        `${result.dryRun ? "preview" : "updated"}: ${result.filesToWrite.length} writes, ${result.filesToRemove.length} removals (harness ${VERSION})\n`,
      );
    if (result.backupDir) process.stdout.write(`backup: ${result.backupDir}\n`);
    for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
    if (!result.dryRun && !result.upToDate) {
      process.stdout.write("next: commit the generated files\n");
    }
  });

program
  .command("uninstall")
  .description("Remove all files previously written by `init` into a target directory")
  .argument("<target-dir>", "directory to uninstall harness from")
  .action((targetDir: string) => {
    const result = uninstallCommand({ targetDir });
    process.stdout.write(
      `removed ${result.filesRemoved.length} files and ${result.dirsPruned.length} empty dirs from ${targetDir}\n`,
    );
    for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
  });

program
  .command("check")
  .description("Verify repo layout: doc pillars present and .gitignore correct")
  .argument("<repo>", "path to repo to check")
  .action((repo: string) => {
    const result = checkCommand(repo);
    if (result.pass) {
      process.stdout.write("✔ layout OK\n");
      process.exit(0);
    }
    for (const issue of result.issues) process.stdout.write(`✘ ${issue}\n`);
    process.exit(1);
  });

program
  .command("lint")
  .description("Run all mechanical linters and exit non-zero on errors")
  .option(
    "--pillar <pillar>",
    "filter by pillar (spec, decisions, handbook, tests, workflow, quality)",
  )
  .option("--only <ids>", "comma-separated linter ids to run (e.g. lint:cross-links)")
  .option("--format <fmt>", "text | json", "text")
  .option("--cwd <dir>", "repo root", ".")
  .action((opts: Record<string, string | undefined>) => {
    const repoRoot = resolve(opts.cwd ?? ".");
    const only = parseList(opts.only);
    const lintOpts = {
      ...(opts.pillar ? { pillar: opts.pillar } : {}),
      ...(only && only.length > 0 ? { only } : {}),
    };
    const report = runLinters(repoRoot, lintOpts);
    if (opts.format === "json") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatReportText(report)}\n`);
    }
    process.exit(report.summary.pass ? 0 : 1);
  });

program
  .command("render")
  .description("Render harness for preview (no overrides applied)")
  .requiredOption("--engines <list>", ENGINES_HELP)
  .requiredOption("--out <dir>", "output directory")
  .option("--package-dir <dir>", "override harness package directory")
  .action((opts: Record<string, string | boolean | undefined>) => {
    const packageDir = (opts.packageDir as string | undefined) ?? resolvePackageDir();
    const result = renderCommand({
      engines: parseList(opts.engines as string | undefined) ?? [],
      outDir: opts.out as string,
      packageDir,
    });
    process.stdout.write(`rendered ${result.filesWritten.length} files to ${opts.out}\n`);
    for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
  });

// 1.x wrote this command into engine Stop hooks. It stays a silent no-op so an
// un-migrated hook entry does not fail every turn; it goes away in 3.0.
program
  .command("stop-hook", { hidden: true })
  .description("deprecated no-op kept for Stop hook entries written by 1.x")
  .option("--engine <engine>")
  .option("--cwd <dir>")
  .action(() => {
    process.stderr.write(
      "vaubaan-harness stop-hook was removed in 2.0: remove this entry from your engine settings and run `npx @vaubaan/harness lint` in CI and pre-commit instead\n",
    );
    process.exit(0);
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
