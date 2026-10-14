import { describe, expect, it } from "vitest";
import { ParseError } from "./schemas.js";
import { parseSkill } from "./skill.js";

const VALID_SKILL = `---
id: doc-audit
description: Audit la doc.
engines: [claude-code, codex-cli, opencode]
requires: [multi-step]
tags: [audit, doc]
---

# Doc Audit

Body content here.
`;

describe("parseSkill", () => {
  it("parses a valid skill frontmatter + body", () => {
    const skill = parseSkill("/virtual/doc-audit.skill.md", VALID_SKILL);
    expect(skill.meta.id).toBe("doc-audit");
    expect(skill.meta.engines).toEqual(["claude-code", "codex-cli", "opencode"]);
    expect(skill.meta.requires).toEqual(["multi-step"]);
    expect(skill.meta.tags).toEqual(["audit", "doc"]);
    expect(skill.body).toMatch(/^# Doc Audit/);
    expect(skill.sourcePath).toBe("/virtual/doc-audit.skill.md");
  });

  it("accepts skill without optional fields", () => {
    const src = `---
id: minimal
description: Minimal skill.
---

Body.
`;
    const skill = parseSkill("/m.skill.md", src);
    expect(skill.meta.id).toBe("minimal");
    expect(skill.meta.engines).toBeUndefined();
    expect(skill.meta.requires).toBeUndefined();
    expect(skill.meta.tags).toBeUndefined();
  });

  it("rejects invalid id (uppercase)", () => {
    const src = `---
id: BadId
description: x
---
body
`;
    expect(() => parseSkill("/x.skill.md", src)).toThrow(ParseError);
  });

  it("rejects unknown engine", () => {
    const src = `---
id: x
description: x
engines: [emacs]
---
body
`;
    expect(() => parseSkill("/x.skill.md", src)).toThrow(ParseError);
  });

  it("rejects unknown frontmatter field (strict)", () => {
    const src = `---
id: x
description: x
kinds: [coding]
---
body
`;
    expect(() => parseSkill("/x.skill.md", src)).toThrow(ParseError);
  });
});
