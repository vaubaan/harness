import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { get } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareSession, reviewNext, reviewReply, reviewStop } from "../../src/cli/review.js";
import { type ReviewServer, startReviewServer } from "../../src/review/server.js";
import { readSession } from "../../src/review/session.js";

const FIXTURE = resolve(__dirname, "../fixtures/acme-billing");
const PACKAGE_DIR = resolve(__dirname, "../../src");
const TOKEN = "test-token";

let repo: string;
let server: ReviewServer | undefined;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cah-review-"));
  cpSync(FIXTURE, repo, { recursive: true });
  renameSync(join(repo, "gitignore.txt"), join(repo, ".gitignore"));
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm init", {
    cwd: repo,
    stdio: "ignore",
  });
});
afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(repo, { recursive: true, force: true });
});

async function start(): Promise<ReviewServer> {
  prepareSession(repo, { packageDir: PACKAGE_DIR });
  server = await startReviewServer({
    root: repo,
    token: TOKEN,
    packageDir: PACKAGE_DIR,
    debounceMs: 50,
  });
  return server;
}

function base(): string {
  return `http://127.0.0.1:${server?.port}`;
}

function api(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${base()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-harness-token": TOKEN, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Resolves with the delay until the `n`-th `update` event after the call. */
function nextUpdate(after: () => void): Promise<number> {
  return new Promise((done, fail) => {
    const req = get(`${base()}/api/events`, { headers: { "x-harness-token": TOKEN } }, (res) => {
      let seen = 0;
      let t0 = 0;
      res.on("data", (chunk: Buffer) => {
        seen += (chunk.toString().match(/event: update/g) ?? []).length;
        if (seen === 1 && !t0) {
          t0 = Date.now();
          after();
        } else if (seen >= 2 && t0) {
          req.destroy();
          done(Date.now() - t0);
        }
      });
    });
    req.on("error", (e) => (e.message.includes("aborted") ? undefined : fail(e)));
  });
}

describe("review session", () => {
  it("a doc edit appears on the open view within two seconds", async () => {
    await start();
    const delay = await nextUpdate(() =>
      writeFileSync(
        join(repo, "docs/handbook/invoice-pipeline.md"),
        "---\ntracks: [vitest.config.ts]\n---\n# Changed\n",
      ),
    );
    expect(delay).toBeLessThan(2000);
    const html = await (await api("/")).text();
    expect(html).toContain("Changed");
  });

  it("the differences mark added, changed and removed cards against the session start, with the lint delta", async () => {
    await start();
    writeFileSync(
      join(repo, "docs/handbook/new-map.md"),
      "---\ntracks: [src/gone.ts]\n---\n# New map\n",
    );
    rmSync(join(repo, "docs/decisions/postgres-over-sqlite.md"));
    writeFileSync(
      join(repo, "docs/handbook/invoice-pipeline.md"),
      readFileSync(join(repo, "docs/handbook/invoice-pipeline.md"), "utf8").replace(
        "# Invoice pipeline",
        "# Invoice flow",
      ),
    );
    server?.rebuild(["docs/handbook/new-map.md"]);
    await new Promise((r) => setTimeout(r, 2500));
    const html = await (await api("/")).text();
    expect(html).toMatch(/class="n [^"]*is-add/);
    expect(html).toMatch(/class="n [^"]*is-chg/);
    expect(html).toMatch(/class="n [^"]*is-del/);
    expect(html).toContain("lint:frontmatter-tracks");
    expect(html).toMatch(/<span class="tv">\+[1-9]\d* −/);
  });

  it("review discard restores docs/ and README.md byte for byte, untracked files included, and touches no code", async () => {
    writeFileSync(join(repo, "docs/handbook/draft.md"), "never added to git\n");
    const before = {
      spec: readFileSync(join(repo, "docs/spec/invoicing.md"), "utf8"),
      adr: readFileSync(join(repo, "docs/decisions/postgres-over-sqlite.md"), "utf8"),
      readme: readFileSync(join(repo, "README.md"), "utf8"),
    };
    await start();
    writeFileSync(join(repo, "docs/spec/invoicing.md"), "changed\n");
    writeFileSync(join(repo, "README.md"), "changed\n");
    rmSync(join(repo, "docs/decisions/postgres-over-sqlite.md"));
    rmSync(join(repo, "docs/handbook/draft.md"));
    writeFileSync(join(repo, "docs/workflow/extra.md"), "created\n");
    writeFileSync(join(repo, "src/invoicing/issue.ts"), "export const changedCode = 2;\n");
    const result = await reviewStop(repo, "discard");
    expect(result.changes.created).toEqual(["docs/workflow/extra.md"]);
    expect(readFileSync(join(repo, "docs/spec/invoicing.md"), "utf8")).toBe(before.spec);
    expect(readFileSync(join(repo, "docs/decisions/postgres-over-sqlite.md"), "utf8")).toBe(
      before.adr,
    );
    expect(readFileSync(join(repo, "README.md"), "utf8")).toBe(before.readme);
    expect(readFileSync(join(repo, "docs/handbook/draft.md"), "utf8")).toBe("never added to git\n");
    expect(existsSync(join(repo, "docs/workflow/extra.md"))).toBe(false);
    expect(readFileSync(join(repo, "src/invoicing/issue.ts"), "utf8")).toBe(
      "export const changedCode = 2;\n",
    );
    expect(readSession(repo)).toBeUndefined();
    server = undefined;
  });

  it("review keep leaves the changes in place and archives the threads", async () => {
    await start();
    writeFileSync(join(repo, "docs/spec/invoicing.md"), "kept\n");
    const result = await reviewStop(repo, "keep");
    expect(result.changes.modified).toEqual(["docs/spec/invoicing.md"]);
    expect(readFileSync(join(repo, "docs/spec/invoicing.md"), "utf8")).toBe("kept\n");
    expect(existsSync(result.archive)).toBe(true);
    server = undefined;
  });

  it("a comment pinned to a card survives a reload and a rebuild", async () => {
    await start();
    const res = await api("/api/threads", {
      nodeId: "doc:docs/spec/invoicing.md",
      body: "Define credit note.",
    });
    expect(res.status).toBe(201);
    server?.rebuild(["docs/spec/invoicing.md"]);
    const html = await (await api("/")).text();
    expect(html).toContain("Define credit note.");
    expect(readSession(repo)?.threads[0]?.messages[0]?.body).toBe("Define credit note.");
  });

  it("hands a submitted batch to the agent, which answers each thread with the file and line it changed", async () => {
    await start();
    await api("/api/threads", { nodeId: "term:invoice", body: "Say it is immutable." });
    expect((await reviewNext(repo, 1)).code).toBe(3);
    expect((await api("/api/submit", {})).status).toBe(200);
    const next = await reviewNext(repo, 5);
    expect(next.code).toBe(0);
    expect(next.batch?.threads.map((t) => t.id)).toEqual(["t1"]);
    await reviewReply(repo, "t1", "Done.", [{ path: "docs/spec/invoicing.md", line: 7 }]);
    const thread = readSession(repo)?.threads[0];
    expect(thread?.status).toBe("answered");
    expect(thread?.messages[1]).toMatchObject({
      author: "agent",
      changes: [{ path: "docs/spec/invoicing.md", line: 7 }],
    });
    await api("/api/end", {});
    expect((await reviewNext(repo, 1)).code).toBe(4);
  });

  it("refuses a request without the token or from a foreign Host", async () => {
    await start();
    expect((await fetch(`${base()}/`)).status).toBe(403);
    const foreign = await new Promise<number>((done) =>
      get(`${base()}/`, { headers: { "x-harness-token": TOKEN, host: "evil.example" } }, (r) =>
        done(r.statusCode ?? 0),
      ),
    );
    expect(foreign).toBe(403);
    const login = await fetch(`${base()}/?t=${TOKEN}`, { redirect: "manual" });
    expect(login.status).toBe(303);
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("keeps one session per repo", async () => {
    await start();
    expect(() => prepareSession(repo)).toThrow(/live/);
  });
});
