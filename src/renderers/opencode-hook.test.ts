import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { opencodeRenderer } from "./opencode.js";

interface SessionMessage {
  info: { role: string; agent?: string; summary?: boolean };
  parts: unknown[];
}

interface PluginEvent {
  event: { type: string; properties?: { sessionID?: string } };
}

interface Plugin {
  event(input: PluginEvent): Promise<void>;
}

const idle: PluginEvent = {
  event: { type: "session.idle", properties: { sessionID: "session-review" } },
};

function message(role: string, agent?: string, summary?: boolean): SessionMessage {
  return { info: { role, agent, summary }, parts: [] };
}

async function loadPlugin(history: SessionMessage[] = [message("user", "review")]) {
  const spawnSync = vi.fn().mockReturnValue({ status: 2, stderr: "  lint report\n" });
  const messages = vi.fn().mockResolvedValue({ data: history });
  const prompt = vi.fn().mockResolvedValue({});
  const client = { session: { messages, prompt } };
  const content = opencodeRenderer.renderStopHook().files[0]?.content;
  if (!content) throw new Error("missing emitted OpenCode plugin");

  // Execute the emitted plugin, replacing only its module boundary to inject
  // the child-process mock. The hook implementation itself is unchanged.
  const script = content
    .replace('import { spawnSync } from "node:child_process";', "")
    .replace("export const HarnessStopHook", "const HarnessStopHook");
  const factory = runInNewContext(`${script}\nHarnessStopHook`, { spawnSync }) as (input: {
    client: typeof client;
    directory: string;
  }) => Promise<Plugin>;
  const plugin = await factory({ client, directory: "/project" });
  return { plugin, spawnSync, messages, prompt };
}

describe("emitted OpenCode stop hook", () => {
  it.each(["review", "planning"])("preserves the latest %s assistant persona", async (agent) => {
    const { plugin, spawnSync, messages, prompt } = await loadPlugin([
      message("user", "build"),
      message("assistant", agent),
    ]);

    await plugin.event(idle);

    expect(spawnSync).toHaveBeenCalledWith(
      "npx",
      ["-y", "@vaubaan/harness", "stop-hook", "--engine", "opencode", "--cwd", "/project"],
      { input: JSON.stringify({ sessionID: "session-review" }), encoding: "utf-8" },
    );
    expect(messages).toHaveBeenCalledWith({ path: { id: "session-review" } });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith({
      path: { id: "session-review" },
      body: { agent, parts: [{ type: "text", text: "lint report" }] },
    });
  });

  it("uses a newer user selection instead of the previous assistant persona", async () => {
    const { plugin, prompt } = await loadPlugin([
      message("assistant", "review"),
      message("user", "planning"),
    ]);

    await plugin.event(idle);

    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ agent: "planning" }) }),
    );
  });

  it("ignores internal compaction summaries when recovering the persona", async () => {
    const { plugin, prompt } = await loadPlugin([
      message("user", "review"),
      message("assistant", "compaction", true),
    ]);

    await plugin.event(idle);

    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ agent: "review" }) }),
    );
  });

  it.each([[], [message("user")], [message("assistant", " ")], [message("system", "build")]])(
    "skips continuation when no conversation persona is known (%j)",
    async (...history) => {
      const { plugin, prompt } = await loadPlugin(history);

      await plugin.event(idle);

      expect(prompt).not.toHaveBeenCalled();
    },
  );

  it.each([
    { error: { message: "unavailable" }, data: [message("user", "review")] },
    {},
    { data: null },
  ])("skips continuation when the history response fails (%j)", async (response) => {
    const { plugin, messages, prompt } = await loadPlugin();
    messages.mockResolvedValue(response);

    await plugin.event(idle);

    expect(prompt).not.toHaveBeenCalled();
  });

  it("skips continuation on a network rejection without an unhandled promise", async () => {
    const { plugin, messages, prompt } = await loadPlugin();
    messages.mockRejectedValue(new Error("connection lost"));

    await expect(plugin.event(idle)).resolves.toBeUndefined();

    expect(prompt).not.toHaveBeenCalled();
  });

  it.each([
    { status: 0, stderr: "" },
    { status: 1, stderr: "command failed" },
    { status: 2, stderr: " \n" },
  ])("preserves the CLI decision to stop or pass through (%j)", async (result) => {
    const { plugin, spawnSync, messages, prompt } = await loadPlugin();
    spawnSync.mockReturnValue(result);

    await plugin.event(idle);

    expect(messages).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("ignores unrelated events and idle events without a session", async () => {
    const { plugin, spawnSync, messages, prompt } = await loadPlugin();

    await plugin.event({ event: { type: "message.updated" } });
    await plugin.event({ event: { type: "session.idle" } });

    expect(spawnSync).not.toHaveBeenCalled();
    expect(messages).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });
});
