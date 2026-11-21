import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initCommand } from "../../src/cli/init.js";
import { intentProfiles } from "../../src/linters/intent-profiles.js";
import { profileSchema } from "../../src/linters/profile-schema.js";
import { parseIntentFile } from "../../src/parser/intent.js";
import { parseProfileFile, readProfileFiles } from "../../src/parser/profile.js";
import { buildProfilesIndex } from "../../src/renderers/profiles-index.js";

const PACKAGE_DIR = resolve(__dirname, "..", "..", "src");

const PROFILE = `---
title: Lead developer adopting coding agents
status: validated
evidence:
  - ../research/interviews.md
  - https://example.com/synthesis
last_reviewed: 2026-11-21
---

# Lead developer adopting coding agents

Leads a team of five that started using coding agents this quarter.

## Pains

- **Context rot** — the agent's context diverges from the code within weeks.
- **Silent decisions** — a choice made in a chat is lost with the session.

## Gains

- **Same-day onboarding** — a newcomer, human or agent, is productive on day one.
`;

const intent = (fields: string, actors = "lead-developer") => `---
title: Specify a change
status: implemented
actors: [${actors}]
spec: ../spec/system.md
last_reviewed: 2026-11-21
---

# Specify a change

As a lead developer, I specify before coding.

## Write the intent

anchors: src/a.ts
${fields}
## Read the backlog

anchors: src/a.ts
`;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cah-profiles-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
function write(rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}
const messages = (issues: ReadonlyArray<{ message: string }>) => issues.map((i) => i.message);

describe("a profile file", () => {
  it("names its pains and gains in rank order, each by the slug of its bold name", () => {
    const profile = parseProfileFile("docs/profiles/lead-developer.md", PROFILE);
    expect(profile.errors).toEqual([]);
    expect(profile.title).toBe("Lead developer adopting coding agents");
    expect(profile.pains.map((pain) => pain.slug)).toEqual(["context-rot", "silent-decisions"]);
    expect(profile.gains).toMatchObject([
      { name: "Same-day onboarding", slug: "same-day-onboarding" },
    ]);
  });

  it("accepts the French headings and ignores bullets outside Pains and Gains", () => {
    const profile = parseProfileFile(
      "docs/profiles/p.md",
      "---\ntitle: P\nstatus: hypothesis\nlast_reviewed: 2026-11-21\n---\n\n# P\n\n- **Not a pain** — intro bullet\n\n## Irritants\n\n- **Contexte perdu** — x\n\n## Bénéfices\n\n- **Calme** — y\n\n## Notes\n\n- **Aside** — z\n",
    );
    expect(profile.errors).toEqual([]);
    expect(profile.pains.map((p) => p.slug)).toEqual(["contexte-perdu"]);
    expect(profile.gains.map((g) => g.slug)).toEqual(["calme"]);
  });

  it("lint:profile-schema passes on a validated profile whose evidence resolves", () => {
    write("docs/profiles/lead-developer.md", PROFILE);
    write("docs/research/interviews.md", "# Interviews\n");
    expect(profileSchema.run(root)).toEqual([]);
  });

  it("lint:profile-schema reports nothing while the pillar is inactive", () => {
    expect(profileSchema.run(root)).toEqual([]);
  });

  it("lint:profile-schema fails on a validated profile without evidence, and on evidence that does not resolve", () => {
    write("docs/profiles/lead-developer.md", PROFILE);
    expect(messages(profileSchema.run(root))).toEqual([
      "`evidence` does not resolve: ../research/interviews.md",
    ]);
    write("docs/profiles/lead-developer.md", PROFILE.replace(/evidence:\n( {2}- .*\n)+/, ""));
    expect(messages(profileSchema.run(root))).toEqual([
      "a `validated` profile needs `evidence:` — without it, it is a `hypothesis`",
    ]);
  });

  it("lint:profile-schema fails on an unknown field, an unnamed or duplicate pain, and an empty profile", () => {
    write(
      "docs/profiles/a.md",
      "---\ntitle: A\nstatus: hypothesis\nlast_reviewed: 2026-11-21\njobs: [x]\n---\n\n# A\n\n## Pains\n\n- no name here\n- **Context rot** — x\n- **Context rot** — again\n",
    );
    write(
      "docs/profiles/b.md",
      "---\ntitle: B\nstatus: guess\nlast_reviewed: 2026-11-21\n---\n\n# B\n\nNothing yet.\n",
    );
    const issues = profileSchema.run(root);
    expect(issues.filter((i) => i.file.endsWith("a.md")).map((i) => [i.line, i.message])).toEqual([
      [1, "frontmatter: Unrecognized key(s) in object: 'jobs'"],
      [12, "a pain opens with its name in bold"],
      [14, "duplicate pain `context-rot`"],
    ]);
    const b = messages(issues.filter((i) => i.file.endsWith("b.md")));
    expect(b[0]).toMatch(/frontmatter `status`/);
    expect(b).toContain("a profile names at least one pain or one gain");
  });
});

describe("the link from the intents to the profiles", () => {
  beforeEach(() => {
    write("docs/research/interviews.md", "# Interviews\n");
  });

  it("with intents alone, actors stay free strings and nothing is reported", () => {
    write("docs/intents/specify.md", intent("", "maintainer, coding-agent"));
    expect(intentProfiles.run(root)).toEqual([]);
  });

  it("with intents alone, relieves: and delivers: need the profiles pillar", () => {
    write("docs/intents/specify.md", intent("relieves: context-rot\n"));
    expect(messages(intentProfiles.run(root))).toEqual([
      '"Write the intent": `relieves:` needs the profiles pillar — `npx @vaubaan/harness add profiles`',
    ]);
  });

  it("with both pillars, passes when actors are profiles and slugs are their pains and gains", () => {
    write("docs/profiles/lead-developer.md", PROFILE);
    write(
      "docs/intents/specify.md",
      intent("relieves: context-rot, silent-decisions\ndelivers: same-day-onboarding\n"),
    );
    expect(intentProfiles.run(root)).toEqual([]);
  });

  it("with both pillars, fails on an actor that is no profile and on an unknown pain or gain", () => {
    write("docs/profiles/lead-developer.md", PROFILE);
    write(
      "docs/intents/specify.md",
      intent("relieves: same-day-onboarding\ndelivers: speed\n", "lead-developer, maintainer"),
    );
    const issues = intentProfiles.run(root);
    expect(issues.map((i) => [i.line, i.message])).toEqual([
      [1, "actor `maintainer` is not a profile: no docs/profiles/maintainer.md"],
      [
        16,
        '"Write the intent": `same-day-onboarding` is not a pain of `lead-developer`, `maintainer`',
      ],
      [17, '"Write the intent": `speed` is not a gain of `lead-developer`, `maintainer`'],
    ]);
  });
});

describe("the profiles index: the fit, read from the repo", () => {
  it("lists each profile with its intents, and under each pain the intents that relieve it", () => {
    write("docs/profiles/lead-developer.md", PROFILE);
    const profiles = readProfileFiles(root);
    const file = "specify.md";
    const intents = [
      {
        path: `docs/intents/${file}`,
        file,
        ...parseIntentFile(`docs/intents/${file}`, intent("relieves: silent-decisions\n")),
      },
    ];
    expect(buildProfilesIndex(profiles, intents)).toBe(`# Profiles

Who this project serves, and what the intents do for them. Generated by \`@vaubaan/harness\` from \`docs/profiles/*.md\` and \`docs/intents/*.md\`: edit those, not this file, then run \`npx @vaubaan/harness update .\`.

## [Lead developer adopting coding agents](./lead-developer.md) — validated

Intents: [Specify a change](../intents/specify.md).

Pains, most severe first:

- **Context rot** (\`context-rot\`) — *no intent relieves it yet*
- **Silent decisions** (\`silent-decisions\`) — [Write the intent](../intents/specify.md)

Gains:

- **Same-day onboarding** (\`same-day-onboarding\`) — *no intent delivers it yet*
`);
  });

  it("is rendered by init while the pillar is active, with the map line and the writer skill", () => {
    write("README.md", "# P\n");
    write("docs/profiles/lead-developer.md", PROFILE);
    const result = initCommand({
      targetDir: root,
      engines: ["claude-code"],
      packageDir: PACKAGE_DIR,
    });
    expect(result.filesWritten).toEqual(
      expect.arrayContaining([
        "docs/profiles/README.md",
        ".claude/skills/harn-intent-writer/SKILL.md",
      ]),
    );
    expect(readFileSync(join(root, "docs/profiles/README.md"), "utf8")).toContain(
      "Intents: none names this profile yet.",
    );
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
      "- `docs/profiles/<profile>.md`",
    );
  });
});
