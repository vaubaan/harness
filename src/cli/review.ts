/**
 * `vaubaan-harness review …` (docs/spec/coding-agent-harness.md §10.4): the
 * tool of a review session. The loop itself is the `harn-canvas-review` skill.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { resolve } from "node:path";
import { type Batch, startReviewServer } from "../review/server.js";
import {
  type Changes,
  type ServerInfo,
  archiveSession,
  changesSince,
  newSessionId,
  newToken,
  processAlive,
  readServerInfo,
  readSession,
  restoreSnapshot,
  reviewPath,
  takeSnapshot,
  writeJson,
  writeSession,
} from "../review/session.js";
import { buildGraph } from "../view/graph.js";

export interface StartArgs {
  targetDir: string;
  port?: number;
  host?: string;
  resume?: boolean;
  /** Serve from this process instead of a detached one. */
  foreground?: boolean;
  packageDir?: string;
  /** The CLI entry to spawn the detached server with. */
  cliPath?: string;
}

/** Exit codes of `review next`, so an agent's loop can branch on them. */
export const NEXT_EXIT = { batch: 0, timeout: 3, closed: 4 } as const;

function liveServer(root: string): ServerInfo | undefined {
  const info = readServerInfo(root);
  return info && processAlive(info.pid) ? info : undefined;
}

/** Prepares the session: snapshot of the docs and graph at the start. */
export function prepareSession(
  root: string,
  opts: { resume?: boolean; packageDir?: string } = {},
): string {
  const live = liveServer(root);
  if (live)
    throw new Error(
      `a review session is live: ${live.url}\nend it with \`review keep\` or \`review discard\``,
    );
  const existing = readSession(root);
  if (existing && !opts.resume) {
    throw new Error(
      `review session ${existing.id} was not ended: run \`review start --resume\`, \`review keep\` or \`review discard\``,
    );
  }
  if (existing) return existing.id;
  if (!existsSync(resolve(root, "docs")) && !existsSync(resolve(root, "README.md"))) {
    throw new Error("nothing to review: no docs/ and no README.md");
  }
  const id = newSessionId();
  const snapshot = takeSnapshot(root);
  const base = buildGraph(root, opts.packageDir ? { packageDir: opts.packageDir } : {});
  writeJson(reviewPath(root, "base.graph.json"), base);
  writeSession(root, {
    version: 1,
    id,
    startedAt: new Date().toISOString(),
    status: "live",
    snapshot,
    batch: 0,
    delivered: 0,
    threads: [],
    journal: [],
  });
  return id;
}

export async function reviewStart(args: StartArgs): Promise<ServerInfo> {
  const root = resolve(args.targetDir);
  prepareSession(root, args);
  if (args.foreground) {
    const s = await startReviewServer({
      root,
      token: newToken(),
      ...(args.port !== undefined ? { port: args.port } : {}),
      ...(args.host ? { host: args.host } : {}),
      ...(args.packageDir ? { packageDir: args.packageDir } : {}),
      onClose: () => process.exit(0),
    });
    const info = readServerInfo(root);
    if (!info) throw new Error("review server did not record itself");
    void s;
    return info;
  }
  const cli = args.cliPath ?? process.argv[1];
  if (!cli) throw new Error("cannot locate the CLI to start the review server");
  const flags = ["review", "serve", root];
  if (args.port !== undefined) flags.push("--port", String(args.port));
  if (args.host) flags.push("--host", args.host);
  const child = spawn(process.execPath, [cli, ...flags], { detached: true, stdio: "ignore" });
  child.unref();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const info = readServerInfo(root);
    if (info && info.pid === child.pid) return info;
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    "the review server did not start; run `vaubaan-harness review serve .` to see why",
  );
}

interface HttpResult {
  status: number;
  body: string;
}

function call(
  info: ServerInfo,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<HttpResult> {
  const host = info.host === "0.0.0.0" || info.host === "::" ? "127.0.0.1" : info.host;
  return new Promise((resolveCall, reject) => {
    const req = request(
      {
        host,
        port: info.port,
        method,
        path,
        headers: {
          "x-harness-token": info.token,
          "x-harness-author": "agent",
          "content-type": "application/json",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolveCall({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("review server did not answer")));
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function requireServer(root: string): ServerInfo {
  const info = liveServer(root);
  if (!info) throw new Error("no live review session: run `vaubaan-harness review start`");
  return info;
}

async function ok(result: HttpResult): Promise<unknown> {
  if (result.status >= 400)
    throw new Error(result.body.trim() || `review server answered ${result.status}`);
  return result.body ? (JSON.parse(result.body) as unknown) : undefined;
}

export async function reviewNext(
  targetDir: string,
  timeoutSec = 540,
): Promise<{ code: number; batch?: Batch }> {
  const info = requireServer(resolve(targetDir));
  const res = await call(
    info,
    "GET",
    `/api/next?timeout=${timeoutSec}`,
    undefined,
    (timeoutSec + 30) * 1000,
  );
  if (res.status === 204) return { code: NEXT_EXIT.timeout };
  const value = (await ok(res)) as Batch | { closed: true };
  if ("closed" in value) return { code: NEXT_EXIT.closed };
  return { code: NEXT_EXIT.batch, batch: value };
}

export async function reviewReply(
  targetDir: string,
  thread: string,
  body: string,
  changes: Array<{ path: string; line: number }>,
): Promise<unknown> {
  const info = requireServer(resolve(targetDir));
  return ok(
    await call(info, "POST", `/api/threads/${encodeURIComponent(thread)}/messages`, {
      body,
      changes,
    }),
  );
}

export async function reviewComment(
  targetDir: string,
  nodeId: string,
  body: string,
): Promise<unknown> {
  const info = requireServer(resolve(targetDir));
  return ok(await call(info, "POST", "/api/threads", { nodeId, body }));
}

export async function reviewNote(targetDir: string, text: string): Promise<unknown> {
  const info = requireServer(resolve(targetDir));
  return ok(await call(info, "POST", "/api/note", { body: text }));
}

export async function reviewStatus(targetDir: string): Promise<unknown> {
  const root = resolve(targetDir);
  const info = liveServer(root);
  if (info)
    return { url: info.url, ...((await ok(await call(info, "GET", "/api/session"))) as object) };
  const session = readSession(root);
  if (!session) return { status: "none" };
  return {
    id: session.id,
    status: `${session.status} (server not running: \`review start --resume\`)`,
    threads: session.threads,
    changes: changesSince(root, session.snapshot),
  };
}

/** Ends the session: `keep` leaves the docs as they are, `discard` restores the snapshot. */
export async function reviewStop(
  targetDir: string,
  mode: "keep" | "discard",
): Promise<{ changes: Changes; archive: string }> {
  const root = resolve(targetDir);
  const info = liveServer(root);
  if (info) {
    const value = (await ok(await call(info, "POST", "/api/stop", { mode }))) as {
      changes: Changes;
      archive: string;
    };
    return value;
  }
  const session = readSession(root);
  if (!session) throw new Error("no review session to end");
  const changes =
    mode === "discard"
      ? restoreSnapshot(root, session.snapshot)
      : changesSince(root, session.snapshot);
  const archive = archiveSession(root, session, mode === "discard" ? "discarded" : "kept");
  return { changes, archive };
}

export function formatChanges(c: Changes): string {
  const lines = [
    ...c.modified.map((f) => `  M ${f}`),
    ...c.created.map((f) => `  A ${f}`),
    ...c.deleted.map((f) => `  D ${f}`),
  ];
  return lines.length ? lines.join("\n") : "  (no change)";
}
