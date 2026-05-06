import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureSandbox, stopSandbox, removeSandbox } from "../../src/sandbox/lifecycle.js";
import type { ResolvedConfig, AgentDefinition } from "../../src/config/types.js";

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: {
    status: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: "test" }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    execInSandbox: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/sandbox/lock.js", () => ({
  withSandboxLock: vi.fn((_name: string, fn: () => Promise<void>) => fn()),
}));

vi.mock("../../src/secrets/store.js", () => ({
  getSecret: vi.fn().mockResolvedValue("secret-value"),
}));

vi.mock("../../src/toolchains/runner.js", () => ({
  runToolchains: vi.fn().mockResolvedValue(undefined),
}));

const agentDef: AgentDefinition = {
  template: "docker/sandbox-templates:claude-code-docker",
  command: "claude",
  authVolumes: [{ type: "volume", name: "claude-auth", target: "/home/agent/.claude" }],
  defaultSecrets: ["ANTHROPIC_API_KEY"],
  defaultDomains: ["api.anthropic.com"],
};

function makeCfg(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    agent: "claude",
    agentDef,
    image: "docker/sandbox-templates:claude-code-docker",
    command: "claude",
    env: {},
    mounts: [{ type: "bind", source: "/tmp/test", target: "/workspace" }],
    secrets: ["ANTHROPIC_API_KEY"],
    domains: ["api.anthropic.com"],
    toolchain: [],
    setup: [],
    raw: {},
    bare: false,
    workspaceDir: "/tmp/test",
    workspaceSlug: "test",
    sandboxName: "test-claude",
    ...overrides,
  };
}

describe("ensureSandbox v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates + starts sandbox when missing", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("missing");

    await ensureSandbox(makeCfg());

    expect(msb.create).toHaveBeenCalledOnce();
    expect(msb.start).toHaveBeenCalledOnce();
    const createArg = vi.mocked(msb.create).mock.calls[0][0];
    expect(createArg.name).toBe("test-claude");
    expect(createArg.image).toBe("docker/sandbox-templates:claude-code-docker");
  });

  it("only starts sandbox when stopped", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("stopped");

    await ensureSandbox(makeCfg());

    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).toHaveBeenCalledOnce();
  });

  it("no-ops when running", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("running");

    await ensureSandbox(makeCfg());

    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).not.toHaveBeenCalled();
  });

  it("collects secret values and passes to create", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("missing");

    await ensureSandbox(makeCfg());

    const createArg = vi.mocked(msb.create).mock.calls[0][0];
    expect(createArg.secretArgs).toContain("--secret");
  });

  it("runs toolchains after creation", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    const { runToolchains } = await import("../../src/toolchains/runner.js");
    vi.mocked(msb.status).mockResolvedValue("missing");

    await ensureSandbox(makeCfg({ toolchain: [{ node: "22" }] }));

    expect(runToolchains).toHaveBeenCalledWith("test-claude", [{ node: "22" }]);
  });

  it("runs setup commands after toolchains", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("missing");

    await ensureSandbox(makeCfg({ setup: ["npm ci"] }));

    const execCalls = vi.mocked(msb.execInSandbox).mock.calls;
    const setupCall = execCalls.find((c) => c[1] === "bash" && c[2]?.includes("-c"));
    expect(setupCall).toBeDefined();
  });

  it("skips secret if not in store", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    const store = await import("../../src/secrets/store.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    vi.mocked(store.getSecret).mockResolvedValue(undefined);

    await ensureSandbox(makeCfg());

    const createArg = vi.mocked(msb.create).mock.calls[0][0];
    expect(createArg.secretArgs).toEqual([]);
  });
});

describe("stopSandbox", () => {
  it("delegates to msb.stop", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    await stopSandbox("test");
    expect(msb.stop).toHaveBeenCalledWith("test");
  });
});

describe("removeSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stops then removes running sandbox", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("running");
    await removeSandbox("test");
    expect(msb.stop).toHaveBeenCalledWith("test");
    expect(msb.rm).toHaveBeenCalledWith("test");
  });

  it("no-ops for missing sandbox", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    await removeSandbox("test");
    expect(msb.stop).not.toHaveBeenCalled();
    expect(msb.rm).not.toHaveBeenCalled();
  });
});
