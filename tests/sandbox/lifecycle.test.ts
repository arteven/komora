import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureSandbox, stopSandbox, removeSandbox } from "../../src/sandbox/lifecycle.js";
import type { ResolvedConfig, AgentDefinition } from "../../src/config/types.js";

const mockSandbox = vi.hoisted(() => ({
  exec: vi.fn(),
  shell: vi.fn().mockResolvedValue({ success: true, code: 0, stdout: () => "", stderr: () => "" }),
  attach: vi.fn(),
  stop: vi.fn(),
  stopAndWait: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: {
    status: vi.fn(),
    create: vi.fn().mockResolvedValue(mockSandbox),
    start: vi.fn().mockResolvedValue(mockSandbox),
    connect: vi.fn().mockResolvedValue(mockSandbox),
    stop: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/sandbox/lock.js", () => ({
  withSandboxLock: vi.fn((_name: string, fn: () => Promise<unknown>) => fn()),
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
    mockSandbox.shell.mockResolvedValue({ success: true, code: 0, stdout: () => "", stderr: () => "" });
  });

  it("creates + starts sandbox when missing", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    vi.mocked(msb.create).mockResolvedValue(mockSandbox);
    vi.mocked(msb.start).mockResolvedValue(mockSandbox);

    const sandbox = await ensureSandbox(makeCfg());

    expect(msb.create).toHaveBeenCalledOnce();
    expect(msb.start).toHaveBeenCalledOnce();
    const createArg = vi.mocked(msb.create).mock.calls[0][0];
    expect(createArg.name).toBe("test-claude");
    expect(createArg.image).toBe("docker/sandbox-templates:claude-code-docker");
    expect(sandbox).toBe(mockSandbox);
  });

  it("only starts sandbox when stopped", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("stopped");
    vi.mocked(msb.start).mockResolvedValue(mockSandbox);

    await ensureSandbox(makeCfg());

    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).toHaveBeenCalledOnce();
  });

  it("connects to sandbox when already running", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("running");
    vi.mocked(msb.connect).mockResolvedValue(mockSandbox);

    const sandbox = await ensureSandbox(makeCfg());

    expect(msb.create).not.toHaveBeenCalled();
    expect(msb.start).not.toHaveBeenCalled();
    expect(msb.connect).toHaveBeenCalledOnce();
    expect(sandbox).toBe(mockSandbox);
  });

  it("collects secret values and passes to create", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    vi.mocked(msb.create).mockResolvedValue(mockSandbox);
    vi.mocked(msb.start).mockResolvedValue(mockSandbox);

    await ensureSandbox(makeCfg());

    const createArg = vi.mocked(msb.create).mock.calls[0][0];
    expect(createArg.secretArgs).toContain("--secret");
  });

  it("runs toolchains after creation", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    const { runToolchains } = await import("../../src/toolchains/runner.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    vi.mocked(msb.create).mockResolvedValue(mockSandbox);
    vi.mocked(msb.start).mockResolvedValue(mockSandbox);

    await ensureSandbox(makeCfg({ toolchain: [{ node: "22" }] }));

    expect(runToolchains).toHaveBeenCalledWith(mockSandbox, [{ node: "22" }], false);
  });

  it("runs setup commands after toolchains", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    vi.mocked(msb.create).mockResolvedValue(mockSandbox);
    vi.mocked(msb.start).mockResolvedValue(mockSandbox);

    await ensureSandbox(makeCfg({ setup: ["npm ci"] }));

    expect(mockSandbox.shell).toHaveBeenCalledWith("npm ci");
  });

  it("skips secret if not in store", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    const store = await import("../../src/secrets/store.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    vi.mocked(msb.create).mockResolvedValue(mockSandbox);
    vi.mocked(msb.start).mockResolvedValue(mockSandbox);
    vi.mocked(store.getSecret).mockResolvedValue(undefined);

    await ensureSandbox(makeCfg());

    const createArg = vi.mocked(msb.create).mock.calls[0][0];
    expect(createArg.secretArgs).toEqual([]);
  });

  it("passes verbose flag to init sequence", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    const { runToolchains } = await import("../../src/toolchains/runner.js");
    vi.mocked(msb.status).mockResolvedValue("missing");
    vi.mocked(msb.create).mockResolvedValue(mockSandbox);
    vi.mocked(msb.start).mockResolvedValue(mockSandbox);

    await ensureSandbox(makeCfg({ toolchain: [{ node: "22" }] }), { verbose: true });

    expect(runToolchains).toHaveBeenCalledWith(mockSandbox, [{ node: "22" }], true);
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
    vi.mocked(msb.connect).mockResolvedValue(mockSandbox as any);
    await removeSandbox("test");
    expect(msb.connect).toHaveBeenCalledWith("test");
    expect(mockSandbox.stopAndWait).toHaveBeenCalled();
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
