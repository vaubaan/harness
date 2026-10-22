import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyUpdateTransaction } from "./update-transaction.js";

const mocked = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => mocked.home,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
let sandbox: string;
let root: string;
let backup: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "cah-update-transaction-"));
  root = join(sandbox, "project");
  backup = join(sandbox, "backup");
  mocked.home = join(sandbox, "home");
  mkdirSync(root);
  vi.mocked(writeFileSync).mockReset().mockImplementation(realFs.writeFileSync);
});

afterEach(() => {
  vi.mocked(writeFileSync).mockReset().mockImplementation(realFs.writeFileSync);
  rmSync(sandbox, { recursive: true, force: true });
});

function put(path: string, content: string | Buffer, mode = 0o644): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  realFs.writeFileSync(join(root, path), content);
  chmodSync(join(root, path), mode);
}

function failOnceOn(path: string): void {
  let failed = false;
  vi.mocked(writeFileSync).mockImplementation((file, content, options) => {
    if (!failed && file === join(root, path)) {
      failed = true;
      throw new Error("injected write failure");
    }
    return realFs.writeFileSync(file, content, options);
  });
}

describe("applyUpdateTransaction", () => {
  it("backs up bytes and modes privately before applying removals and ordered writes", () => {
    const original = Buffer.from([0, 128, 255, 10]);
    put("AGENTS.md", original, 0o640);
    put(".codex/skills/old.md", "legacy", 0o750);
    put(".harness-manifest.json", "old manifest", 0o600);

    const result = applyUpdateTransaction(
      root,
      [
        { path: "AGENTS.md", content: "updated" },
        { path: ".agents/skills/new/SKILL.md", content: "new skill" },
        { path: ".harness-manifest.json", content: "new manifest" },
      ],
      [".codex/skills/old.md", ".codex/skills/missing.md"],
      backup,
    );

    expect(result.backupDir).toBe(backup);
    expect(readFileSync(join(backup, "files/AGENTS.md"))).toEqual(original);
    expect(readFileSync(join(backup, "files/.codex/skills/old.md"), "utf8")).toBe("legacy");
    expect(statSync(backup).mode & 0o777).toBe(0o700);
    expect(statSync(join(backup, "files/.codex/skills")).mode & 0o777).toBe(0o700);
    expect(statSync(join(backup, "files/AGENTS.md")).mode & 0o777).toBe(0o600);
    expect(statSync(join(backup, "snapshot.json")).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(join(backup, "snapshot.json"), "utf8"))).toMatchObject({
      root,
      entries: expect.arrayContaining([
        { path: ".agents/skills/new/SKILL.md", exists: false },
        { path: ".codex/skills/missing.md", exists: false },
        expect.objectContaining({ path: "AGENTS.md", exists: true, mode: 0o640 }),
      ]),
    });
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("updated");
    expect(statSync(join(root, "AGENTS.md")).mode & 0o777).toBe(0o640);
    expect(existsSync(join(root, ".codex/skills/old.md"))).toBe(false);
    expect(existsSync(join(root, ".codex/skills"))).toBe(true);
    const projectWrites = vi
      .mocked(writeFileSync)
      .mock.calls.filter(([path]) => typeof path === "string" && path.startsWith(root));
    expect(projectWrites.map(([path]) => path)).toEqual([
      join(root, "AGENTS.md"),
      join(root, ".agents/skills/new/SKILL.md"),
      join(root, ".harness-manifest.json"),
    ]);
  });

  it("creates unique durable backups beneath the user's state directory by default", () => {
    put("AGENTS.md", "old");
    const first = applyUpdateTransaction(root, [{ path: "AGENTS.md", content: "first" }], []);
    const second = applyUpdateTransaction(root, [{ path: "AGENTS.md", content: "second" }], []);
    expect(first.backupDir).not.toBe(second.backupDir);
    expect(dirname(first.backupDir)).toBe(
      join(mocked.home, ".local/state/vaubaan-harness/backups"),
    );
    expect(readFileSync(join(first.backupDir, "files/AGENTS.md"), "utf8")).toBe("old");
    expect(readFileSync(join(second.backupDir, "files/AGENTS.md"), "utf8")).toBe("first");
  });

  it("keeps the manifest private without changing existing file modes", () => {
    put(".harness-manifest.json", "old manifest", 0o644);
    put("CLAUDE.md", "existing stub", 0o640);
    applyUpdateTransaction(
      root,
      [
        { path: "CLAUDE.md", content: "@AGENTS.md\n" },
        { path: "AGENTS.md", content: "instructions" },
        { path: ".harness-manifest.json", content: "ownership" },
      ],
      [],
      backup,
    );

    expect(statSync(join(root, ".harness-manifest.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(root, "CLAUDE.md")).mode & 0o777).toBe(0o640);
    expect(statSync(join(root, "AGENTS.md")).mode & 0o777).toBe(0o644);
  });

  it("restores the original manifest mode when its private update fails", () => {
    put(".harness-manifest.json", "old manifest", 0o644);
    failOnceOn(".harness-manifest.json");

    expect(() =>
      applyUpdateTransaction(
        root,
        [{ path: ".harness-manifest.json", content: "private ownership snapshots" }],
        [],
        backup,
      ),
    ).toThrow(/rollback completed/);

    expect(statSync(join(root, ".harness-manifest.json")).mode & 0o777).toBe(0o644);
    expect(readFileSync(join(root, ".harness-manifest.json"), "utf8")).toBe("old manifest");
  });

  it("restores all original bytes and modes and removes only newly created directories on failure", () => {
    put("AGENTS.md", "original", 0o640);
    put(".codex/skills/old.md", Buffer.from([0, 255]), 0o750);
    put(".harness-manifest.json", "original manifest", 0o600);
    mkdirSync(join(root, ".agents"));
    chmodSync(join(root, ".agents"), 0o750);
    failOnceOn(".harness-manifest.json");

    expect(() =>
      applyUpdateTransaction(
        root,
        [
          { path: "AGENTS.md", content: "updated" },
          { path: ".agents/skills/new/SKILL.md", content: "new" },
          { path: ".harness-manifest.json", content: "updated manifest" },
        ],
        [".codex/skills/old.md"],
        backup,
      ),
    ).toThrow(`update failed; backup: ${backup}; rollback completed: injected write failure`);

    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("original");
    expect(statSync(join(root, "AGENTS.md")).mode & 0o777).toBe(0o640);
    expect(readFileSync(join(root, ".codex/skills/old.md"))).toEqual(Buffer.from([0, 255]));
    expect(statSync(join(root, ".codex/skills/old.md")).mode & 0o777).toBe(0o750);
    expect(readFileSync(join(root, ".harness-manifest.json"), "utf8")).toBe("original manifest");
    expect(readdirSync(join(root, ".agents"))).toEqual([]);
    expect(statSync(join(root, ".agents")).mode & 0o777).toBe(0o750);
    expect(existsSync(join(backup, "snapshot.json"))).toBe(true);
  });

  it("reports rollback failures with the backup location and continues restoring other files", () => {
    put("AGENTS.md", "original");
    put("CLAUDE.md", "original Claude");
    vi.mocked(writeFileSync).mockImplementation((file, content, options) => {
      if (
        file === join(root, ".harness-manifest.json") ||
        (file === join(root, "AGENTS.md") && Buffer.isBuffer(content))
      ) {
        throw new Error("disk unavailable");
      }
      return realFs.writeFileSync(file, content, options);
    });

    expect(() =>
      applyUpdateTransaction(
        root,
        [
          { path: "AGENTS.md", content: "updated" },
          { path: "CLAUDE.md", content: "updated Claude" },
          { path: ".harness-manifest.json", content: "manifest" },
        ],
        [],
        backup,
      ),
    ).toThrow(`backup: ${backup}; rollback errors: AGENTS.md: disk unavailable`);
    expect(readFileSync(join(root, "CLAUDE.md"), "utf8")).toBe("original Claude");
    expect(readFileSync(join(backup, "files/AGENTS.md"), "utf8")).toBe("original");
  });

  it("restores a file whose write failed after truncating its original contents", () => {
    put("AGENTS.md", "original", 0o640);
    let failed = false;
    vi.mocked(writeFileSync).mockImplementation((file, content, options) => {
      if (!failed && file === join(root, "AGENTS.md")) {
        failed = true;
        realFs.writeFileSync(file, "partial", options);
        throw new Error("interrupted write");
      }
      return realFs.writeFileSync(file, content, options);
    });

    expect(() =>
      applyUpdateTransaction(root, [{ path: "AGENTS.md", content: "updated" }], [], backup),
    ).toThrow(/rollback completed: interrupted write/);

    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("original");
    expect(statSync(join(root, "AGENTS.md")).mode & 0o777).toBe(0o640);
  });

  it("never mutates the project if writing the backup fails", () => {
    put("AGENTS.md", "original");
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error("backup disk full");
    });

    expect(() =>
      applyUpdateTransaction(root, [{ path: "AGENTS.md", content: "updated" }], [], backup),
    ).toThrow(`could not prepare update backup at ${backup}; project unchanged: backup disk full`);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("original");
  });

  it("rejects a late unsafe destination before creating a backup or removing anything", () => {
    put("AGENTS.md", "original");
    expect(() =>
      applyUpdateTransaction(root, [{ path: "../outside", content: "bad" }], ["AGENTS.md"], backup),
    ).toThrow(/unsafe harness path/);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("original");
    expect(existsSync(backup)).toBe(false);
  });

  it("rejects symbolic targets before backup creation", () => {
    put("AGENTS.md", "original");
    symlinkSync(join(sandbox, "outside"), join(root, ".codex"));
    expect(() =>
      applyUpdateTransaction(
        root,
        [{ path: ".codex/agents/old.toml", content: "stale" }],
        ["AGENTS.md"],
        backup,
      ),
    ).toThrow(/symbolic link/);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("original");
    expect(existsSync(backup)).toBe(false);
  });

  it("rejects existing backups instead of changing their contents", () => {
    mkdirSync(backup);
    realFs.writeFileSync(join(backup, "keep"), "mine");
    expect(() => applyUpdateTransaction(root, [], [], backup)).toThrow(/already exists/);
    expect(readFileSync(join(backup, "keep"), "utf8")).toBe("mine");
  });

  it("rejects a backup path containing a symlink", () => {
    const alias = join(sandbox, "alias");
    symlinkSync(root, alias, "dir");
    expect(() => applyUpdateTransaction(root, [], [], join(alias, "backup"))).toThrow(
      /unsafe update backup directory/,
    );
    expect(lstatSync(alias).isSymbolicLink()).toBe(true);
    expect(existsSync(join(root, "backup"))).toBe(false);
  });

  it("rejects backups inside the project, including a canonicalized target alias", () => {
    const alias = join(sandbox, "alias");
    symlinkSync(root, alias, "dir");
    expect(() => applyUpdateTransaction(alias, [], [], join(root, ".codex/backup"))).toThrow(
      /outside the target project/,
    );
    expect(existsSync(join(root, ".codex"))).toBe(false);
  });
});
