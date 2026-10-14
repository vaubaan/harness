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

interface V2Event {
  type: string;
  data?: { sessionID?: string };
  location?: { directory: string };
}

interface V2Plugin {
  id: string;
  setup(context: unknown): (() => void) | undefined;
}

// Executes the emitted plugin, replacing only its module boundaries to
// inject the child-process mock. The hook implementation itself is unchanged.
function evaluatePlugin(spawnSync: ReturnType<typeof vi.fn>) {
  const content = opencodeRenderer.renderStopHook().files[0]?.content;
  if (!content) throw new Error("missing emitted OpenCode plugin");
  const script = content
    .replace('import { spawnSync } from "node:child_process";', "")
    .replace("export default {", "const definition = {");
  return runInNewContext(
    `${script}\n({ HarnessStopHook: definition.server, V2Plugin: definition })`,
    {
      spawnSync,
      AbortController,
    },
  ) as {
    HarnessStopHook: (input: { client: unknown; directory: string }) => Promise<Plugin>;
    V2Plugin: V2Plugin;
  };
}

async function loadPlugin(history: SessionMessage[] = [message("user", "review")]) {
  const spawnSync = vi.fn().mockReturnValue({ status: 2, stderr: "  lint report\n" });
  const messages = vi.fn().mockResolvedValue({ data: history });
  const prompt = vi.fn().mockResolvedValue({});
  const client = { session: { messages, prompt } };
  const plugin = await evaluatePlugin(spawnSync).HarnessStopHook({ client, directory: "/project" });
  return { plugin, spawnSync, messages, prompt };
}

// Runs the V2 plugin until it has consumed every given event.
async function runV2(events: V2Event[], spawnResult = { status: 2, stderr: "  lint report\n" }) {
  const spawnSync = vi.fn().mockReturnValue(spawnResult);
  const prompt = vi.fn().mockResolvedValue({});
  let signal: AbortSignal | undefined;
  let drained!: () => void;
  const done = new Promise<void>((resolve) => {
    drained = resolve;
  });
  const subscribe = vi.fn((options: { signal: AbortSignal }) => {
    signal = options.signal;
    return (async function* () {
      yield* events;
      drained();
    })();
  });
  const context = {
    location: { directory: "/project" },
    event: { subscribe },
    session: { prompt },
  };
  const { V2Plugin } = evaluatePlugin(spawnSync);
  const cleanup = V2Plugin.setup(context);
  await done;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { V2Plugin, cleanup, spawnSync, prompt, subscribe, signal: () => signal };
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

describe("emitted OpenCode stop hook — OpenCode 2.x", () => {
  const v2Idle: V2Event = { type: "session.idle", data: { sessionID: "ses-1" } };

  it("exposes one default definition: id, server() for 1.x and setup() for 2.x", async () => {
    const { V2Plugin } = await runV2([]);
    expect(V2Plugin.id).toBe("vaubaan-harness-stop-hook");
    expect(typeof V2Plugin.setup).toBe("function");
    expect(typeof (V2Plugin as unknown as { server: unknown }).server).toBe("function");
  });

  it("lints on session.idle and sends the report to the same session", async () => {
    const { spawnSync, prompt } = await runV2([v2Idle]);
    expect(spawnSync).toHaveBeenCalledWith(
      "npx",
      ["-y", "@vaubaan/harness", "stop-hook", "--engine", "opencode", "--cwd", "/project"],
      { input: JSON.stringify({ sessionID: "ses-1" }), encoding: "utf-8" },
    );
    expect(prompt).toHaveBeenCalledWith({ sessionID: "ses-1", text: "lint report" });
  });

  it("ignores other events, idle events without a session, and other directories", async () => {
    const { spawnSync, prompt } = await runV2([
      { type: "session.execution.succeeded", data: { sessionID: "ses-1" } },
      { type: "session.idle", data: {} },
      { ...v2Idle, location: { directory: "/elsewhere" } },
    ]);
    expect(spawnSync).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("accepts idle events located in its own directory", async () => {
    const { prompt } = await runV2([{ ...v2Idle, location: { directory: "/project" } }]);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 0, stderr: "" },
    { status: 1, stderr: "command failed" },
    { status: 2, stderr: " \n" },
  ])("does not prompt when the CLI lets the turn end (%j)", async (result) => {
    const { prompt } = await runV2([v2Idle], result);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("returns a cleanup that aborts the subscription", async () => {
    const { cleanup, signal } = await runV2([]);
    expect(signal()?.aborted).toBe(false);
    cleanup?.();
    expect(signal()?.aborted).toBe(true);
  });
});
