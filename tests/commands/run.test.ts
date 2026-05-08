import { describe, it, expect, vi, beforeEach } from "vitest";
import { run } from "../../src/commands/run.js";

vi.mock("../../src/config/index.js", () => ({
  loadResolvedConfig: vi.fn().mockResolvedValue({
    agent: "claude",
    agentDef: { template: "t", command: "claude", authVolumes: [], defaultSecrets: [], defaultDomains: [] },
    image: "t",
    command: "claude",
    env: {},
    mounts: [],
    secrets: [],
    domains: [],
    toolchain: [],
    setup: [],
    raw: {},
    bare: false,
    workspaceDir: "/tmp",
    workspaceSlug: "tmp",
    sandboxName: "tmp-claude",
  }),
}));

const mockSandbox = vi.hoisted(() => ({ attach: vi.fn(), exec: vi.fn(), shell: vi.fn(), stop: vi.fn() }));
vi.mock("../../src/sandbox/lifecycle.js", () => ({
  ensureSandbox: vi.fn().mockResolvedValue(mockSandbox),
}));

vi.mock("../../src/sandbox/agent.js", () => ({
  runAgent: vi.fn().mockResolvedValue(0),
}));

describe("run command v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs agent and returns exit code", async () => {
    const code = await run({ agent: "claude", argv: [], workspaceDir: "/tmp" });
    expect(code).toBe(0);
  });

  it("passes --bare to loadResolvedConfig", async () => {
    const { loadResolvedConfig } = await import("../../src/config/index.js");
    await run({ agent: "claude", argv: [], workspaceDir: "/tmp", bare: true });
    expect(loadResolvedConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bare: true })
    );
  });

  it("passes --profile to loadResolvedConfig", async () => {
    const { loadResolvedConfig } = await import("../../src/config/index.js");
    await run({ agent: "claude", argv: [], workspaceDir: "/tmp", profile: "work" });
    expect(loadResolvedConfig).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "work" })
    );
  });

  it("--dry-run prints config without creating sandbox", async () => {
    const { ensureSandbox } = await import("../../src/sandbox/lifecycle.js");
    const { runAgent } = await import("../../src/sandbox/agent.js");
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const code = await run({ agent: "claude", argv: [], workspaceDir: "/tmp", dryRun: true });

    expect(ensureSandbox).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled();
    expect(code).toBe(0);
    writeSpy.mockRestore();
  });
});
