import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeProjectDir, collectLessonEvents, quoteOf } from "../../src/lessons/collect.js";

let repo: string;
let home: string;

function write(rel: string, content: string, base = repo): void {
  mkdirSync(dirname(join(base, rel)), { recursive: true });
  writeFileSync(join(base, rel), content);
}
function commit(message: string, files: Record<string, string>): void {
  for (const [f, c] of Object.entries(files)) write(f, c);
  execSync(
    `git add -A && git -c user.email=t@t -c user.name=t commit -qm ${JSON.stringify(message)}`,
    { cwd: repo },
  );
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "cah-lessons-"));
  home = mkdtempSync(join(tmpdir(), "cah-home-"));
  execSync("git init -q", { cwd: repo });
  commit("feat: issue invoices", { "src/issue.ts": "1", "CHANGELOG.md": "" });
  commit("fix: address review, add the changelog entry", { "CHANGELOG.md": "- issue" });
  commit("feat: void invoices", { "src/void.ts": "1" });
  commit("fixup! feat: void invoices", { "src/void.ts": "2" });
  write(
    ".vaubaan/review/archive/2026-11-20-abc123.json",
    JSON.stringify({
      threads: [
        {
          id: "t1",
          anchor: { nodeId: "doc:docs/spec/x.md", sourcePath: "docs/spec/x.md" },
          messages: [
            { author: "human", body: "Define the word first.", at: "2026-11-20T10:00:00Z" },
            { author: "agent", body: "Done.", at: "2026-11-20T10:01:00Z" },
          ],
        },
      ],
    }),
  );
  write(
    ".vaubaan/lessons/prs.json",
    JSON.stringify([
      {
        number: 7,
        url: "https://x/pr/7",
        comments: [
          {
            body: "Missing changelog entry",
            path: "CHANGELOG.md",
            createdAt: "2026-11-10T09:00:00Z",
          },
        ],
        commits: [
          { sha: "aaaa", message: "feat: x", date: "2026-11-10T08:00:00Z" },
          {
            sha: "bbbb",
            message: "add changelog",
            files: ["CHANGELOG.md"],
            date: "2026-11-10T11:00:00Z",
          },
        ],
      },
    ]),
  );
  const transcript = [
    {
      type: "user",
      message: { role: "user", content: "Add a view command." },
      timestamp: "2026-11-21T14:00:00Z",
    },
    {
      type: "queue-operation",
      operation: "enqueue",
      content: "pour l'instant on prépare le plan",
      timestamp: "2026-11-21T14:01:00Z",
    },
    {
      type: "user",
      message: {
        role: "user",
        content: "non, pas comme ça : token sk-abcdefghijklmnopqrstuvwxyz0123",
      },
      timestamp: "2026-11-21T14:02:00Z",
    },
    {
      type: "user",
      message: { role: "user", content: "<command-name>/clear</command-name>" },
      timestamp: "2026-11-21T14:03:00Z",
    },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
  write(join(claudeProjectDir(repo, home).slice(home.length + 1), "s1.jsonl"), transcript, home);
});
afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe("lessons collect", () => {
  it("extracts patch events from the history, the pull requests and the review threads", () => {
    const r = collectLessonEvents(repo, { home });
    const bySource = (s: string) => r.events.filter((e) => e.source === s);
    expect(bySource("git").map((e) => e.quote)).toEqual([
      "fix: address review, add the changelog entry",
      "fixup! feat: void invoices",
    ]);
    expect(bySource("git")[1]?.signal).toMatch(/^retouches /);
    expect(
      bySource("pull-requests")
        .map((e) => e.signal)
        .sort(),
    ).toEqual(["pushed after the first review", "review comment"]);
    expect(bySource("review-threads").map((e) => e.quote)).toEqual(["Define the word first."]);
    expect(JSON.parse(readFileSync(r.path, "utf8")).events).toHaveLength(r.events.length);
  });

  it("reads conversation histories only for the sources the project enables", () => {
    const off = collectLessonEvents(repo, { home, sources: ["claude-code"] });
    expect(off.events).toEqual([]);
    expect(off.warnings.join()).toMatch(/enable it in .harnessrc/);
    write(".harnessrc.json", JSON.stringify({ lessons: { sources: ["claude-code"] } }));
    const on = collectLessonEvents(repo, { home });
    const talk = on.events.filter((e) => e.source === "claude-code");
    expect(talk.map((e) => e.signal)).toEqual([
      "sent while the agent worked",
      "correction wording",
    ]);
    expect(talk[1]?.quote).toBe("non, pas comme ça : token ‹masked›");
  });

  it("is deterministic for the same inputs", () => {
    const a = readFileSync(collectLessonEvents(repo, { home }).path, "utf8");
    const b = readFileSync(collectLessonEvents(repo, { home }).path, "utf8");
    expect(a).toBe(b);
  });

  it("quotes one line and masks secrets", () => {
    expect(quoteOf("\n  first line ghp_abcdefghijklmnopqrstuvwxyz123456\nsecond")).toBe(
      "first line ‹masked›",
    );
  });
});
