#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { formatReportText, runLinters } from "../linters/index.js";
import { VERSION } from "../version.js";
import { checkCommand } from "./check.js";
import { initCommand } from "./init.js";
import { renderCommand } from "./render.js";
import { stopHookCommandFromStdin } from "./stop-hook.js";
import { uninstallCommand } from "./uninstall.js";
import { updateCommand } from "./update.js";

function resolvePackageDir(): string {
  // CLI lives at <contentRoot>/cli/index.{ts,js}.
  // In dev <contentRoot> = src/ ; in prod (after tsup + copy) = dist/.
  // Both contain agents/, skills/, commands/, templates/ as siblings of cli/.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..");
}

const program = new Command();

program
  .name("vaubaan-harness")
  .description(
    "Vaubaan harness — render skills, commands, and all agent personas into a target directory",
  )
  .version(VERSION);

program
  .command("init")
  .description(
    "Render the harness (all agents, skills, commands) into a target directory. Defaults to all engines.",
  )
  .argument("<target-dir>", "directory to render harness into")
  .option(
    "--engines <list>",
    "comma-separated subset of engines (claude-code, codex-cli, opencode) — defaults to all 3",
  )
  .option("--overrides-dir <dir>", "directory containing .harness-overrides/")
  .option("--package-dir <dir>", "override harness package directory (for dev/test)")
  .option(
    "--with-mcp <list>",
    "comma-separated MCP servers to render config for (context7) — opt-in",
  )
  .option(
    "--no-stop-hook",
    "skip rendering the Stop-hook configs that run lint at end of each agent turn",
  )
  .action((targetDir: string, opts: Record<string, string | boolean | undefined>) => {
    const packageDir = (opts.packageDir as string | undefined) ?? resolvePackageDir();
    const enginesRaw = opts.engines as string | undefined;
    const engines = enginesRaw ? enginesRaw.split(",").map((s) => s.trim()) : undefined;
    const withMcpRaw = opts.withMcp as string | undefined;
    const mcpServers = withMcpRaw ? withMcpRaw.split(",").map((s) => s.trim()) : undefined;
    const result = initCommand({
      targetDir,
      engines,
      overridesDir: opts.overridesDir as string | undefined,
      packageDir,
      mcpServers,
      withStopHook: opts.stopHook !== false,
    });
    process.stdout.write(`rendered ${result.filesWritten.length} files to ${targetDir}\n`);
    if (result.staleFilesRemoved.length > 0) {
      process.stdout.write(
        `removed ${result.staleFilesRemoved.length} stale files from a previous render\n`,
      );
    }
    if (result.stopHookInstalled) {
      process.stdout.write("stop-hook installed (runs lint at end-of-turn)\n");
    }
    for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
  });

program
  .command("update")
  .description(
    "Migrate an existing harness installation, retaining its engines and project settings",
  )
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
  .description("Verify repo layout: 6 pillars present and .gitignore correct")
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
  .option("--format <fmt>", "text | json", "text")
  .option("--cwd <dir>", "repo root", ".")
  .action((opts: Record<string, string | undefined>) => {
    const repoRoot = resolve(opts.cwd ?? ".");
    const lintOpts = opts.pillar ? { pillar: opts.pillar } : {};
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
  .description("Render harness for preview (no overrides applied). Defaults to all engines.")
  .option(
    "--engines <list>",
    "comma-separated subset of engines (claude-code, codex-cli, opencode) — defaults to all 3",
  )
  .requiredOption("--out <dir>", "output directory")
  .option("--package-dir <dir>", "override harness package directory")
  .option(
    "--with-mcp <list>",
    "comma-separated MCP servers to render config for (context7) — opt-in",
  )
  .option("--no-stop-hook", "skip rendering the Stop-hook configs")
  .action((opts: Record<string, string | boolean | undefined>) => {
    const packageDir = (opts.packageDir as string | undefined) ?? resolvePackageDir();
    const enginesRaw = opts.engines as string | undefined;
    const engines = enginesRaw ? enginesRaw.split(",").map((s) => s.trim()) : undefined;
    const withMcpRaw = opts.withMcp as string | undefined;
    const mcpServers = withMcpRaw ? withMcpRaw.split(",").map((s) => s.trim()) : undefined;
    const result = renderCommand({
      engines,
      outDir: opts.out as string,
      packageDir,
      mcpServers,
      withStopHook: opts.stopHook !== false,
    });
    process.stdout.write(`rendered ${result.filesWritten.length} files to ${opts.out}\n`);
    for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
  });

program
  .command("stop-hook")
  .description(
    "Stop-hook entrypoint invoked by each engine's hook config — runs lint and decides whether to inject the report into the running session, terminate, or passthrough",
  )
  .requiredOption("--engine <engine>", "claude | codex | opencode")
  .option("--cwd <dir>", "repo root", ".")
  .action((opts: Record<string, string | undefined>) => {
    const result = stopHookCommandFromStdin({
      engine: opts.engine as string,
      cwd: opts.cwd,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
