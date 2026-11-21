/**
 * The review server (docs/spec/coding-agent-harness.md §10.4, decision
 * review-loop): serves the view of a review session on the local machine
 * behind a random token, rebuilds it on each change of `docs/` or
 * `README.md`, stores the comments, and hands submitted batches to the agent
 * through `review next`. It is the only writer of `session.json`; it never
 * writes in `docs/` and never commits.
 */
import { type FSWatcher, existsSync, readFileSync, watch } from "node:fs";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { join, normalize } from "node:path";
import { type ContextGraph, buildGraph } from "../view/graph.js";
import { type JournalEntry, type Thread, renderView } from "../view/html.js";
import {
  type SessionState,
  archiveSession,
  changesSince,
  readSession,
  restoreSnapshot,
  reviewPath,
  writeJson,
  writeSession,
} from "./session.js";

export interface ServerOptions {
  root: string;
  token: string;
  port?: number;
  /** Interface to bind; the loopback by default. */
  host?: string;
  packageDir?: string;
  /** Debounce of the docs watcher, in ms. */
  debounceMs?: number;
  /** Called after the server closed itself (keep, discard). */
  onClose?: () => void;
}

export interface ReviewServer {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
  /** Rebuilds now, as the watcher would. */
  rebuild(files?: string[]): void;
}

export interface Batch {
  batch: number;
  threads: Array<Thread & { node?: { title: string; type: string; domain: string } }>;
}

const MAX_BODY = 256 * 1024;

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = "text/plain; charset=utf-8",
): void {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function json(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8");
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        const value = text ? (JSON.parse(text) as unknown) : {};
        resolve(
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {},
        );
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function cookieToken(req: IncomingMessage): string | undefined {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === "harness_review") return v;
  }
  return undefined;
}

export function startReviewServer(opts: ServerOptions): Promise<ReviewServer> {
  const root = opts.root;
  const host = opts.host ?? "127.0.0.1";
  const state = readSession(root);
  if (!state) throw new Error("no review session: run `vaubaan-harness review start` first");
  const session: SessionState = state;
  const base = JSON.parse(
    readFileSync(reviewPath(root, "base.graph.json"), "utf8"),
  ) as ContextGraph;
  const build = (lint: boolean) =>
    buildGraph(root, { lint, ...(opts.packageDir ? { packageDir: opts.packageDir } : {}) });

  let graph: ContextGraph = build(true);
  let revision = 1;
  const clients = new Set<ServerResponse>();
  const waiters = new Set<(b: Batch | "closed" | undefined) => void>();
  let closing = false;

  const persist = () => writeSession(root, session);
  const broadcast = (event: string, data: string) => {
    for (const c of clients) c.write(`event: ${event}\ndata: ${data}\n\n`);
  };
  const bump = () => {
    revision += 1;
    broadcast("update", String(revision));
  };

  let lintTimer: NodeJS.Timeout | undefined;
  const rebuild = (files: string[] = []) => {
    graph = build(false);
    const entry: JournalEntry = {
      at: new Date().toISOString(),
      files,
      errors: graph.lint.errors,
      warnings: graph.lint.warnings,
    };
    if (files.length) session.journal.push(entry);
    bump();
    // Lint after the fast rebuild reached the view: it takes seconds on a large repo.
    if (lintTimer) clearTimeout(lintTimer);
    lintTimer = setTimeout(() => {
      graph = build(true);
      if (files.length) {
        entry.errors = graph.lint.errors;
        entry.warnings = graph.lint.warnings;
      }
      persist();
      bump();
    }, 50);
  };

  // ------------------------------------------------------------- watcher
  const pending = new Set<string>();
  let debounce: NodeJS.Timeout | undefined;
  const changed = (file: string) => {
    if (closing) return;
    pending.add(file);
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const files = [...pending].sort();
      pending.clear();
      rebuild(files);
    }, opts.debounceMs ?? 200);
  };
  const watchers: FSWatcher[] = [];
  if (existsSync(join(root, "docs"))) {
    watchers.push(
      watch(
        join(root, "docs"),
        { recursive: true },
        (_e, f) => f && changed(`docs/${String(f).split("\\").join("/")}`),
      ),
    );
  }
  watchers.push(watch(root, (_e, f) => f && String(f) === "README.md" && changed("README.md")));

  // ------------------------------------------------------------- batches
  const nextBatch = (): Batch | undefined => {
    const threads = session.threads.filter(
      (t) => t.status === "submitted" && (t.batch ?? 0) > session.delivered,
    );
    if (!threads.length) return undefined;
    const batch = Math.max(...threads.map((t) => t.batch ?? 0));
    session.delivered = batch;
    persist();
    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    return {
      batch,
      threads: threads.map((t) => {
        const n = nodes.get(t.anchor.nodeId);
        return n ? { ...t, node: { title: n.title, type: n.type, domain: n.domain } } : t;
      }),
    };
  };
  const wake = () => {
    for (const w of [...waiters]) {
      const b = session.status === "ended" ? "closed" : nextBatch();
      if (!b) return;
      waiters.delete(w);
      w(b);
    }
  };

  // ------------------------------------------------------------- routes
  const allowedHosts = (port: number) =>
    new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, `${host}:${port}`]);

  const handler = async (req: IncomingMessage, res: ServerResponse, port: number) => {
    const url = new URL(req.url ?? "/", "http://local");
    if (host !== "0.0.0.0" && host !== "::" && !allowedHosts(port).has(req.headers.host ?? "")) {
      return send(res, 403, "unexpected Host header");
    }
    if (req.method === "GET" && url.pathname === "/" && url.searchParams.get("t") === opts.token) {
      res.writeHead(303, {
        location: "/",
        "set-cookie": `harness_review=${opts.token}; HttpOnly; SameSite=Strict; Path=/`,
      });
      return res.end();
    }
    const token = req.headers["x-harness-token"] ?? cookieToken(req);
    if (token !== opts.token)
      return send(res, 403, "missing or wrong review token: open the URL `review start` printed");
    const isAgent = req.headers["x-harness-author"] === "agent";

    if (req.method === "GET") {
      if (url.pathname === "/") {
        return send(
          res,
          200,
          renderView(graph, {
            session: {
              id: session.id,
              base,
              threads: session.threads,
              journal: session.journal,
              revision,
            },
          }),
          "text/html; charset=utf-8",
        );
      }
      if (url.pathname === "/graph.json") return json(res, 200, graph);
      if (url.pathname === "/api/session") {
        return json(res, 200, {
          id: session.id,
          status: session.status,
          revision,
          threads: session.threads,
          journal: session.journal,
          changes: changesSince(root, session.snapshot),
        });
      }
      if (url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        });
        res.write(`event: update\ndata: ${revision}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (url.pathname === "/api/next") {
        const timeout = Math.min(Number(url.searchParams.get("timeout") ?? 540), 3600) * 1000;
        if (session.status === "ended") return json(res, 200, { closed: true });
        const ready = nextBatch();
        if (ready) return json(res, 200, ready);
        const timer = setTimeout(() => {
          waiters.delete(reply);
          send(res, 204, "");
        }, timeout);
        const reply = (b: Batch | "closed" | undefined) => {
          clearTimeout(timer);
          json(res, 200, b === "closed" ? { closed: true } : b);
        };
        waiters.add(reply);
        req.on("close", () => {
          clearTimeout(timer);
          waiters.delete(reply);
        });
        return;
      }
      // Read-only sources, for the links of the view.
      const rel = normalize(decodeURIComponent(url.pathname).replace(/^\/+/, ""));
      if (
        (rel === "README.md" || rel.startsWith("docs/")) &&
        !rel.includes("..") &&
        existsSync(join(root, rel))
      ) {
        return send(res, 200, readFileSync(join(root, rel), "utf8"));
      }
      return send(res, 404, "not found");
    }

    if (req.method !== "POST") return send(res, 405, "method not allowed");
    let body: Record<string, unknown>;
    try {
      body = await readBody(req);
    } catch {
      return send(res, 400, "invalid JSON body");
    }
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const threadRoute = /^\/api\/threads\/([^/]+)\/(messages|resolve)$/.exec(url.pathname);

    if (url.pathname === "/api/threads") {
      const nodeId = typeof body.nodeId === "string" ? body.nodeId : "";
      const node =
        graph.nodes.find((n) => n.id === nodeId) ?? base.nodes.find((n) => n.id === nodeId);
      if (!node) return send(res, 400, `unknown card: ${nodeId}`);
      if (!text) return send(res, 400, "empty comment");
      const thread: Thread = {
        id: `t${session.threads.length + 1}`,
        anchor: { nodeId, sourcePath: node.sourcePath, line: node.line },
        status: "open",
        messages: [
          { author: isAgent ? "agent" : "human", body: text, at: new Date().toISOString() },
        ],
      };
      session.threads.push(thread);
      persist();
      bump();
      return json(res, 201, thread);
    }
    if (threadRoute) {
      const thread = session.threads.find((t) => t.id === decodeURIComponent(threadRoute[1] ?? ""));
      if (!thread) return send(res, 404, "unknown thread");
      if (threadRoute[2] === "resolve") {
        thread.status = "resolved";
      } else {
        if (!text) return send(res, 400, "empty message");
        const changes = Array.isArray(body.changes)
          ? body.changes
              .filter(
                (c): c is { path: string; line: number } =>
                  !!c &&
                  typeof c === "object" &&
                  typeof (c as { path?: unknown }).path === "string",
              )
              .map((c) => ({ path: c.path, line: Number(c.line) || 0 }))
          : undefined;
        thread.messages.push({
          author: isAgent ? "agent" : "human",
          body: text,
          at: new Date().toISOString(),
          ...(changes?.length ? { changes } : {}),
        });
        thread.status = isAgent ? "answered" : "open";
      }
      persist();
      bump();
      return json(res, 200, thread);
    }
    if (url.pathname === "/api/submit") {
      const open = session.threads.filter((t) => t.status === "open");
      if (!open.length) return send(res, 400, "no open comment to hand over");
      session.batch += 1;
      for (const t of open) {
        t.status = "submitted";
        t.batch = session.batch;
      }
      persist();
      bump();
      wake();
      return json(res, 200, { batch: session.batch, threads: open.length });
    }
    if (url.pathname === "/api/note") {
      const last = session.journal[session.journal.length - 1];
      if (last && !last.note) last.note = text;
      else
        session.journal.push({
          at: new Date().toISOString(),
          files: [],
          errors: graph.lint.errors,
          warnings: graph.lint.warnings,
          note: text,
        });
      persist();
      bump();
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/api/end") {
      session.status = "ended";
      persist();
      broadcast("end", "");
      for (const w of [...waiters]) {
        waiters.delete(w);
        w("closed");
      }
      return json(res, 200, { ended: true });
    }
    if (url.pathname === "/api/stop") {
      const mode = body.mode === "discard" ? "discard" : body.mode === "keep" ? "keep" : undefined;
      if (!mode) return send(res, 400, "mode must be keep or discard");
      closing = true;
      for (const w of watchers) w.close();
      const changes =
        mode === "discard"
          ? restoreSnapshot(root, session.snapshot)
          : changesSince(root, session.snapshot);
      session.status = mode === "discard" ? "discarded" : "kept";
      const archive = archiveSession(root, session, mode === "discard" ? "discarded" : "kept");
      json(res, 200, { mode, changes, archive });
      broadcast("end", "");
      setTimeout(() => {
        void close().then(() => opts.onClose?.());
      }, 20);
      return;
    }
    return send(res, 404, "not found");
  };

  const server = createServer((req, res) => {
    const port = (server.address() as { port: number } | null)?.port ?? 0;
    handler(req, res, port).catch((e: unknown) =>
      send(res, 500, e instanceof Error ? e.message : String(e)),
    );
  });
  const keepAlive = setInterval(() => {
    for (const c of clients) c.write(": ping\n\n");
  }, 25_000);
  keepAlive.unref();

  const close = () =>
    new Promise<void>((resolve) => {
      closing = true;
      for (const w of watchers) w.close();
      if (debounce) clearTimeout(debounce);
      if (lintTimer) clearTimeout(lintTimer);
      clearInterval(keepAlive);
      for (const c of clients) c.end();
      clients.clear();
      for (const w of [...waiters]) w("closed");
      waiters.clear();
      server.close(() => resolve());
      server.closeAllConnections?.();
    });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => {
      const port = (server.address() as { port: number }).port;
      const shown = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
      const url = `http://${shown}:${port}/?t=${opts.token}`;
      writeJson(reviewPath(root, "server.json"), {
        pid: process.pid,
        port,
        host,
        token: opts.token,
        url,
      });
      resolve({ server, port, url, close, rebuild });
    });
  });
}
