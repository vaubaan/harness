/**
 * `vaubaan-harness lessons collect` (docs/spec/coding-agent-harness.md §10.5,
 * decision lessons-from-reviews): extracts patch events, mechanically and
 * deterministically, for the `lesson-miner` skill to judge. No network call:
 * pull request data is what the skill saved under `.vaubaan/lessons/`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cosmiconfigSync } from "cosmiconfig";
import { writeJson } from "../review/session.js";

export const LESSONS_DIR = ".vaubaan/lessons";
export const LESSON_SOURCES = ["git", "pull-requests", "review-threads", "claude-code"] as const;
export type LessonSource = (typeof LESSON_SOURCES)[number];
/** Sources read without being enabled: they live in the repo or in `.vaubaan/`. */
export const DEFAULT_SOURCES: ReadonlyArray<LessonSource> = [
  "git",
  "pull-requests",
  "review-threads",
];
/** Conversation histories: opt-in, per source, in the project's configuration. */
export const OPT_IN_SOURCES: ReadonlyArray<LessonSource> = ["claude-code"];

export interface PatchEvent {
  id: string;
  source: LessonSource;
  /** What made it an event. */
  signal: string;
  date: string;
  /** A commit, a pull request, a thread, or a conversation file and line. */
  ref: string;
  files: string[];
  /** One line, secrets masked. */
  quote: string;
}

export interface LessonsConfig {
  sources: LessonSource[];
  threshold: number;
}

export interface CollectOptions {
  /** Overrides the configured sources. */
  sources?: ReadonlyArray<string>;
  /** Home directory holding the engines' histories (tests). */
  home?: string;
  /** Commits read from the history. */
  maxCommits?: number;
}

export interface CollectResult {
  events: PatchEvent[];
  sources: LessonSource[];
  warnings: string[];
  path: string;
}

/** `lessons: { sources: [...], threshold: 2 }` in the harness configuration. */
export function loadLessonsConfig(root: string): LessonsConfig {
  const result = cosmiconfigSync("harness", {
    searchPlaces: [
      "package.json",
      ".harnessrc",
      ".harnessrc.json",
      ".harnessrc.yaml",
      ".harnessrc.yml",
      "harness.config.js",
      "harness.config.cjs",
    ],
    stopDir: root,
  }).search(root);
  const raw = (
    result?.config as { lessons?: { sources?: unknown; threshold?: unknown } } | undefined
  )?.lessons;
  const enabled = Array.isArray(raw?.sources)
    ? raw.sources.filter((s): s is LessonSource =>
        (LESSON_SOURCES as ReadonlyArray<unknown>).includes(s),
      )
    : [];
  const sources = [...new Set([...DEFAULT_SOURCES, ...enabled])];
  const threshold = typeof raw?.threshold === "number" && raw.threshold > 0 ? raw.threshold : 2;
  return { sources, threshold };
}

const SECRET =
  /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|[A-Za-z0-9+/_-]{40,})\b/g;

/** One line of at most 200 characters, secrets masked. */
export function quoteOf(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  const masked = line.replace(SECRET, "‹masked›");
  return masked.length > 200 ? `${masked.slice(0, 199)}…` : masked;
}

function eventId(source: string, ref: string, quote: string): string {
  return createHash("sha1")
    .update(`${source}\u0000${ref}\u0000${quote}`)
    .digest("hex")
    .slice(0, 12);
}

// ----------------------------------------------------------------- git

/** Wording of a commit that follows up a review. */
export const REVIEW_WORDING =
  /^(fixup|squash|amend)!|\b(nits?|typo|review|address(es|ed)?|feedback|forgot|forgotten|oubli\w*|missing|follow[- ]?up|lint)\b/i;

function fromGit(root: string, max: number): PatchEvent[] {
  let out: string;
  try {
    out = execFileSync(
      "git",
      ["log", "--no-merges", "-n", String(max), "--format=%x1e%H%x1f%cI%x1f%s", "--name-only"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch {
    return [];
  }
  const commits = out
    .split("\x1e")
    .filter((c) => c.trim())
    .map((c) => {
      const [head = "", ...rest] = c.split("\n");
      const [hash = "", date = "", subject = ""] = head.split("\x1f");
      return { hash, date, subject, files: rest.map((f) => f.trim()).filter(Boolean) };
    });
  const events: PatchEvent[] = [];
  commits.forEach((c, i) => {
    if (!REVIEW_WORDING.test(c.subject) || c.files.length > 5) return;
    // A small commit that retouches files of one of the five commits before it.
    const earlier = commits.slice(i + 1, i + 6);
    const retouched = earlier.find((e) => e.files.some((f) => c.files.includes(f)));
    const quote = quoteOf(c.subject);
    events.push({
      id: eventId("git", c.hash, quote),
      source: "git",
      signal: retouched ? `retouches ${retouched.hash.slice(0, 7)}` : "review wording",
      date: c.date,
      ref: c.hash.slice(0, 12),
      files: c.files,
      quote,
    });
  });
  return events;
}

// ----------------------------------------------------- pull requests

interface PrData {
  number?: number;
  url?: string;
  comments?: Array<{ body?: string; path?: string; line?: number; createdAt?: string }>;
  commits?: Array<{ sha?: string; message?: string; files?: string[]; date?: string }>;
}

function fromPullRequests(root: string, warnings: string[]): PatchEvent[] {
  const path = join(root, LESSONS_DIR, "prs.json");
  if (!existsSync(path)) return [];
  let prs: PrData[];
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    prs = Array.isArray(value) ? (value as PrData[]) : [];
  } catch {
    warnings.push(`${LESSONS_DIR}/prs.json is not valid JSON; skipped`);
    return [];
  }
  const events: PatchEvent[] = [];
  for (const pr of prs) {
    const ref = pr.url ?? `#${pr.number ?? "?"}`;
    const comments = (pr.comments ?? []).filter((c) => typeof c.body === "string" && c.body.trim());
    const firstReview = comments
      .map((c) => c.createdAt ?? "")
      .filter(Boolean)
      .sort()[0];
    for (const c of comments) {
      const quote = quoteOf(c.body ?? "");
      events.push({
        id: eventId("pull-requests", `${ref}:${quote}`, quote),
        source: "pull-requests",
        signal: "review comment",
        date: c.createdAt ?? "",
        ref: c.path ? `${ref} ${c.path}${c.line ? `:${c.line}` : ""}` : ref,
        files: c.path ? [c.path] : [],
        quote,
      });
    }
    for (const commit of pr.commits ?? []) {
      if (!firstReview || !commit.date || commit.date <= firstReview) continue;
      const quote = quoteOf(commit.message ?? "");
      events.push({
        id: eventId("pull-requests", commit.sha ?? quote, quote),
        source: "pull-requests",
        signal: "pushed after the first review",
        date: commit.date,
        ref: `${ref} ${(commit.sha ?? "").slice(0, 12)}`.trim(),
        files: commit.files ?? [],
        quote,
      });
    }
  }
  return events;
}

// ----------------------------------------------------- review threads

function fromReviewThreads(root: string): PatchEvent[] {
  const dir = join(root, ".vaubaan/review/archive");
  if (!existsSync(dir)) return [];
  const events: PatchEvent[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    let session: {
      threads?: Array<{
        id: string;
        anchor?: { sourcePath?: string; nodeId?: string };
        messages?: Array<{ author: string; body: string; at: string }>;
      }>;
    };
    try {
      session = JSON.parse(readFileSync(join(dir, file), "utf8")) as typeof session;
    } catch {
      continue;
    }
    for (const t of session.threads ?? []) {
      for (const m of (t.messages ?? []).filter((x) => x.author === "human")) {
        const quote = quoteOf(m.body);
        events.push({
          id: eventId("review-threads", `${file}:${t.id}`, quote),
          source: "review-threads",
          signal: "comment in a review session",
          date: m.at,
          ref: `${file.replace(/\.json$/, "")}/${t.id}${t.anchor?.nodeId ? ` ${t.anchor.nodeId}` : ""}`,
          files: t.anchor?.sourcePath ? [t.anchor.sourcePath] : [],
          quote,
        });
      }
    }
  }
  return events;
}

// ------------------------------------------- engine conversation histories

/** Words of a human correcting the agent, French and English. */
export const CORRECTION_WORDING =
  /^(non|no|nope|pas (comme|ça|ca|besoin)|plut[ôo]t|instead|wrong|faux|stop|arr[êe]te|attention|encore|again|tu as oubli|you forgot|je (t'ai|vous ai) dit|i (said|told you)|ne (fais|mets|touche)|don'?t|never|jamais)\b|\b(au lieu de|instead of|pas comme [çc]a|je veux dire)\b/i;

/** Claude Code keeps a project's history under `~/.claude/projects/<path with every non-alphanumeric as ->`. */
export function claudeProjectDir(root: string, home: string): string {
  return join(home, ".claude", "projects", root.replace(/[^A-Za-z0-9]/g, "-"));
}

function humanText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter(
        (p): p is { type: string; text: string } =>
          !!p && typeof p === "object" && (p as { type?: unknown }).type === "text",
      )
      .map((p) => p.text);
    return texts.length ? texts.join("\n") : undefined;
  }
  return undefined;
}

function fromClaudeCode(root: string, home: string): PatchEvent[] {
  const dir = claudeProjectDir(root, home);
  if (!existsSync(dir)) return [];
  const events: PatchEvent[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()) {
    const seen = new Set<string>();
    const lines = readFileSync(join(dir, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      let entry: {
        type?: string;
        operation?: string;
        content?: unknown;
        timestamp?: string;
        message?: { role?: string; content?: unknown };
      };
      try {
        entry = JSON.parse(line) as typeof entry;
      } catch {
        return;
      }
      let text: string | undefined;
      let midTurn = false;
      if (entry.type === "queue-operation" && entry.operation === "enqueue") {
        text = typeof entry.content === "string" ? entry.content : undefined;
        midTurn = true;
      } else if (entry.type === "user" && entry.message?.role === "user") {
        text = humanText(entry.message.content);
      }
      if (!text) return;
      const trimmed = text.trim();
      // Pasted material, command wrappers and tool output are not the human speaking.
      if (!trimmed || trimmed.startsWith("<")) return;
      const key = trimmed.replace(/\s+/g, " ");
      if (seen.has(key)) return;
      seen.add(key);
      const corrects = CORRECTION_WORDING.test(trimmed);
      if (!midTurn && !corrects) return;
      const quote = quoteOf(trimmed);
      events.push({
        id: eventId("claude-code", `${file}:${i + 1}`, quote),
        source: "claude-code",
        signal: midTurn
          ? corrects
            ? "correction sent while the agent worked"
            : "sent while the agent worked"
          : "correction wording",
        date: entry.timestamp ?? "",
        ref: `${file}:${i + 1}`,
        files: [],
        quote,
      });
    });
  }
  return events;
}

// ------------------------------------------------------------------ entry

export function collectLessonEvents(root: string, opts: CollectOptions = {}): CollectResult {
  const config = loadLessonsConfig(root);
  const warnings: string[] = [];
  const requested = opts.sources ?? config.sources;
  const sources = requested.filter((s): s is LessonSource => {
    if ((LESSON_SOURCES as ReadonlyArray<string>).includes(s)) return true;
    warnings.push(`unknown lesson source \`${s}\` (known: ${LESSON_SOURCES.join(", ")})`);
    return false;
  });
  for (const s of sources) {
    if (OPT_IN_SOURCES.includes(s) && !config.sources.includes(s)) {
      warnings.push(
        `source \`${s}\` reads conversation histories: enable it in .harnessrc (lessons.sources) first; skipped`,
      );
    }
  }
  const allowed = sources.filter((s) => !OPT_IN_SOURCES.includes(s) || config.sources.includes(s));
  const home = opts.home ?? homedir();
  const events: PatchEvent[] = [];
  if (allowed.includes("git")) events.push(...fromGit(root, opts.maxCommits ?? 400));
  if (allowed.includes("pull-requests")) events.push(...fromPullRequests(root, warnings));
  if (allowed.includes("review-threads")) events.push(...fromReviewThreads(root));
  if (allowed.includes("claude-code")) events.push(...fromClaudeCode(root, home));
  events.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const path = join(root, LESSONS_DIR, "events.json");
  writeJson(path, { version: 1, sources: allowed, threshold: config.threshold, events });
  return { events, sources: allowed, warnings, path };
}
