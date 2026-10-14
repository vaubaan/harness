import { describe, expect, it } from "vitest";
import { parseAgent } from "./agent.js";
import { ParseError } from "./schemas.js";

const VALID_AGENT = `---
id: coding
description: Agent coding — workflow doc-check first.
---

# Coding Agent

Workflow:
1. Lis la spec...
`;

describe("parseAgent", () => {
  it("parses a valid agent frontmatter + body", () => {
    const agent = parseAgent("/virtual/coding.agent.md", VALID_AGENT);
    expect(agent.meta.id).toBe("coding");
    expect(agent.body).toMatch(/^# Coding Agent/);
  });

  it("rejects unknown agent id", () => {
    const src = `---
id: bogus
description: x
---
body
`;
    expect(() => parseAgent("/x.agent.md", src)).toThrow(ParseError);
  });

  it("rejects missing description", () => {
    const src = `---
id: coding
---
body
`;
    expect(() => parseAgent("/x.agent.md", src)).toThrow(ParseError);
  });

  it("rejects unknown frontmatter field (strict)", () => {
    const src = `---
id: coding
description: x
kind: coding
---
body
`;
    expect(() => parseAgent("/x.agent.md", src)).toThrow(ParseError);
  });
});
