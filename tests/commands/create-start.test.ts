import { describe, it, expect, vi, beforeEach } from "vitest";
import { create } from "../../src/commands/create.js";
import { start } from "../../src/commands/start.js";

vi.mock("../../src/config/index.js", () => ({
  loadResolvedConfig: vi.fn().mockResolvedValue({
    agent: "claude",
    sandboxName: "test-claude",
  }),
}));

vi.mock("../../src/sandbox/lifecycle.js", () => ({
  ensureSandbox: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: { start: vi.fn().mockResolvedValue(undefined) },
}));

describe("create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls ensureSandbox", async () => {
    const { ensureSandbox } = await import("../../src/sandbox/lifecycle.js");
    await create({ agent: "claude", workspaceDir: "/tmp" });
    expect(ensureSandbox).toHaveBeenCalled();
  });

  it("passes bare flag", async () => {
    const { loadResolvedConfig } = await import("../../src/config/index.js");
    await create({ agent: "claude", workspaceDir: "/tmp", bare: true });
    expect(loadResolvedConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bare: true })
    );
  });
});

describe("start", () => {
  it("calls msb.start", async () => {
    const { msb } = await import("../../src/sandbox/msb.js");
    await start("my-sandbox");
    expect(msb.start).toHaveBeenCalledWith("my-sandbox");
  });
});
