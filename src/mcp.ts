export const MCP_SERVER_IDS = ["context7"] as const;
export type McpServerId = (typeof MCP_SERVER_IDS)[number];

export interface McpServerSpec {
  id: McpServerId;
  description: string;
  command: string;
  args: ReadonlyArray<string>;
  env?: Record<string, string>;
}

export const MCP_SERVERS: Record<McpServerId, McpServerSpec> = {
  context7: {
    id: "context7",
    description:
      "Upstash Context7 — fetches up-to-date library docs via resolve-library-id + get-library-docs.",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
  },
};

export function resolveMcpIds(requested: ReadonlyArray<string>): McpServerId[] {
  return requested.map((id) => {
    if (!(MCP_SERVER_IDS as ReadonlyArray<string>).includes(id)) {
      throw new Error(`unknown MCP server: ${id} (expected one of ${MCP_SERVER_IDS.join(", ")})`);
    }
    return id as McpServerId;
  });
}
