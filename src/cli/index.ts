#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { collectLessonEvents } from "../lessons/collect.js";
import { formatReportText, runLinters } from "../linters/index.js";
import { ADDABLE_PILLARS } from "../pillars.js";
import { startReviewServer } from "../review/server.js";
import { newToken } from "../review/session.js";
import { VERSION } from "../version.js";
import { addCommand } from "./add.js";
import { checkCommand } from "./check.js";
import { initCommand } from "./init.js";
import { renderCommand } from "./render.js";
import {
  NEXT_EXIT,
  formatChanges,
  reviewComment,
  reviewNext,
  reviewNote,
  reviewReply,
  reviewStart,
  reviewStatus,
  reviewStop,
} from "./review.js";
import { uninstallCommand } from "./uninstall.js";
import { updateCommand } from "./update.js";
import { viewCommand } from "./view.js";

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
  .command("add")
  .description(
    `Activate a pillar the project now needs (${ADDABLE_PILLARS.map((p) => p.id).join(", ")}): starter files, its skill, its command`,
  )
  .argument("<pillar>", "pillar to activate")
  .argument("[target-dir]", "project directory", ".")
  .option("--overrides-dir <dir>", "directory containing .harness-overrides/")
  .option("--backup-dir <dir>", "new backup directory outside the project")
  .option("--json", "print the result as JSON")
  .action(
    (pillar: string, targetDir: string, opts: Record<string, string | boolean | undefined>) => {
      const result = addCommand({
        targetDir,
        pillar,
        packageDir: resolvePackageDir(),
        overridesDir: opts.overridesDir as string | undefined,
        backupDir: opts.backupDir as string | undefined,
      });
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
      }
      process.stdout.write(
        result.activated
          ? `added the ${result.pillar} pillar\n`
          : `the ${result.pillar} pillar is already active\n`,
      );
      for (const file of result.filesCreated) process.stdout.write(`created ${file}\n`);
      if (result.update && !result.update.upToDate) {
        process.stdout.write(
          `rendered: ${result.update.filesToWrite.length} writes, ${result.update.filesToRemove.length} removals\n`,
        );
      }
      for (const warning of result.update?.warnings ?? []) {
        process.stderr.write(`warning: ${warning}\n`);
      }
      if (result.next) process.stdout.write(`next: ${result.next}\n`);
    },
  );

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
  .description("Verify repo layout: README present and .gitignore correct")
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
    "filter by pillar (readme, spec, decisions, handbook, tests, workflow, quality, intents, profiles)",
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
  .command("view")
  .description(
    "Build the context graph (.vaubaan/graph.json) and render the view (.vaubaan/view/index.html)",
  )
  .argument("[dir]", "project directory", ".")
  .option("--out <dir>", "output directory (default <dir>/.vaubaan)")
  .option("--no-lint", "skip the linters: faster, no issue attached")
  .option("--json", "print the graph on stdout instead of a summary")
  .action((dir: string, opts: Record<string, string | boolean | undefined>) => {
    const result = viewCommand({
      targetDir: dir,
      ...(typeof opts.out === "string" ? { outDir: opts.out } : {}),
      ...(opts.lint === false ? { lint: false } : {}),
    });
    if (opts.json) {
      process.stdout.write(readFileSync(result.graphPath, "utf8"));
      return;
    }
    const { graph } = result;
    process.stdout.write(
      `graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges → ${result.graphPath}\nview: ${result.htmlPath}\n`,
    );
  });

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function readStdin(): Promise<string> {
  return new Promise((res) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => {
      data += c;
    });
    process.stdin.on("end", () => res(data));
  });
}

const review = program
  .command("review")
  .description(
    "Review session: the view follows the docs live, comments go to the agent; nothing is committed",
  );

review
  .command("start")
  .description("Snapshot docs/ and README.md, start the local review server, print its URL")
  .argument("[dir]", "project directory", ".")
  .option("--port <port>", "port to listen on (default: a free one)")
  .option("--host <host>", "interface to bind (default 127.0.0.1; the token still applies)")
  .option("--resume", "restart the server of a session that was not ended")
  .option("--foreground", "serve from this process")
  .action(async (dir: string, opts: Record<string, string | boolean | undefined>) => {
    const info = await reviewStart({
      targetDir: dir,
      ...(typeof opts.port === "string" ? { port: Number(opts.port) } : {}),
      ...(typeof opts.host === "string" ? { host: opts.host } : {}),
      resume: opts.resume === true,
      foreground: opts.foreground === true,
    });
    process.stdout.write(`review session live: ${info.url}\n`);
    if (info.host !== "127.0.0.1" && info.host !== "localhost") {
      process.stderr.write(
        `warning: listening on ${info.host}; anyone who reaches it still needs the token in the URL\n`,
      );
    }
    process.stdout.write(
      "next: `vaubaan-harness review next` waits for comments; end with `review keep` or `review discard`\n",
    );
  });

review
  .command("serve", { hidden: true })
  .argument("[dir]", "project directory", ".")
  .option("--port <port>")
  .option("--host <host>")
  .action(async (dir: string, opts: Record<string, string | undefined>) => {
    const s = await startReviewServer({
      root: resolve(dir),
      token: newToken(),
      ...(opts.port ? { port: Number(opts.port) } : {}),
      ...(opts.host ? { host: opts.host } : {}),
      onClose: () => process.exit(0),
    });
    process.stdout.write(`${s.url}\n`);
    const stop = () => void s.close().then(() => process.exit(0));
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  });

review
  .command("next")
  .description(
    `Wait for the next batch of comments; exit ${NEXT_EXIT.batch} with JSON, ${NEXT_EXIT.timeout} on timeout (call again), ${NEXT_EXIT.closed} when the review ended`,
  )
  .argument("[dir]", "project directory", ".")
  .option("--timeout <seconds>", "how long to wait", "540")
  .action(async (dir: string, opts: Record<string, string>) => {
    const r = await reviewNext(dir, Number(opts.timeout ?? 540));
    if (r.batch) process.stdout.write(`${JSON.stringify(r.batch, null, 2)}\n`);
    else process.stdout.write(r.code === NEXT_EXIT.closed ? "review ended\n" : "no comment yet\n");
    process.exit(r.code);
  });

review
  .command("reply")
  .description("Answer a comment thread as the agent")
  .argument("<thread>", "thread id, e.g. t3")
  .option("--body <text>", "the answer; `-` or absent reads stdin")
  .option("--change <path:line>", "a file and line the answer changed (repeatable)", collect, [])
  .option("--dir <dir>", "project directory", ".")
  .action(async (thread: string, opts: { body?: string; change: string[]; dir: string }) => {
    const body = opts.body && opts.body !== "-" ? opts.body : await readStdin();
    const changes = opts.change.map((c) => {
      const i = c.lastIndexOf(":");
      return i > 0
        ? { path: c.slice(0, i), line: Number(c.slice(i + 1)) || 0 }
        : { path: c, line: 0 };
    });
    await reviewReply(opts.dir, thread, body, changes);
    process.stdout.write(`answered ${thread}\n`);
  });

review
  .command("comment")
  .description("Pin a comment to a card as the agent (a question back to the human)")
  .argument("<node-id>", "graph node id, e.g. doc:docs/spec/x.md")
  .argument("<text>")
  .option("--dir <dir>", "project directory", ".")
  .action(async (nodeId: string, text: string, opts: { dir: string }) => {
    const t = (await reviewComment(opts.dir, nodeId, text)) as { id: string };
    process.stdout.write(`${t.id}\n`);
  });

review
  .command("note")
  .description("Say in the session journal why the last change was made")
  .argument("<text>")
  .option("--dir <dir>", "project directory", ".")
  .action(async (text: string, opts: { dir: string }) => {
    await reviewNote(opts.dir, text);
  });

review
  .command("status")
  .description("The live session: URL, threads, files changed since the start (JSON)")
  .argument("[dir]", "project directory", ".")
  .action(async (dir: string) => {
    process.stdout.write(`${JSON.stringify(await reviewStatus(dir), null, 2)}\n`);
  });

for (const mode of ["keep", "discard"] as const) {
  review
    .command(mode)
    .description(
      mode === "keep"
        ? "End the session, leave the changes in place, uncommitted"
        : "End the session, restore docs/ and README.md as they were at the start",
    )
    .argument("[dir]", "project directory", ".")
    .action(async (dir: string) => {
      const r = await reviewStop(dir, mode);
      process.stdout.write(
        `${mode === "keep" ? "kept, uncommitted" : "restored"}:\n${formatChanges(r.changes)}\nthreads archived: ${r.archive}\n`,
      );
    });
}

program
  .command("lessons")
  .description("Lessons from reviews: extract the patch events the harn-self-improve skill groups")
  .command("collect")
  .description(
    "Read the history, the pull requests saved in .vaubaan/lessons/prs.json, the archived review threads and the enabled conversation histories; write .vaubaan/lessons/events.json",
  )
  .argument("[dir]", "project directory", ".")
  .option("--sources <list>", "comma-separated sources (default: the configured ones)")
  .action((dir: string, opts: { sources?: string }) => {
    const sources = parseList(opts.sources);
    const r = collectLessonEvents(resolve(dir), sources ? { sources } : {});
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
    const per = new Map<string, number>();
    for (const e of r.events) per.set(e.source, (per.get(e.source) ?? 0) + 1);
    process.stdout.write(
      `${r.events.length} patch events (${r.sources.map((s) => `${s} ${per.get(s) ?? 0}`).join(", ")}) → ${r.path}\n`,
    );
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

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
