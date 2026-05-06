import { describe, it, expect, vi } from "vitest";

const mockSandbox = vi.hoisted(() => ({
  attach: vi.fn(),
}));

vi.mock("microsandbox", () => ({
  Sandbox: {},
}));

import { runAgent } from "../../src/sandbox/agent.js";

describe("runAgent", () => {
  it("returns the exit code from sandbox.attach()", async () => {
    mockSandbox.attach.mockResolvedValue(7);
    const result = await runAgent({ sandbox: mockSandbox as any, agent: "claude", argv: ["--help"] });
    expect(result).toBe(7);
    expect(mockSandbox.attach).toHaveBeenCalledWith("claude", ["--help"]);
  });

  it("forwards argv to attach", async () => {
    mockSandbox.attach.mockResolvedValue(0);
    await runAgent({ sandbox: mockSandbox as any, agent: "bash", argv: ["-c", "echo hi"] });
    expect(mockSandbox.attach).toHaveBeenCalledWith("bash", ["-c", "echo hi"]);
  });
});
