import { describe, it, expect, vi } from "vitest";

const mockBuilder = vi.hoisted(() => ({
  args: vi.fn().mockReturnThis(),
  cwd: vi.fn().mockReturnThis(),
}));

const mockSandbox = vi.hoisted(() => ({
  attachWith: vi.fn(),
}));

vi.mock("microsandbox", () => ({
  Sandbox: {},
}));

import { runAgent } from "../../src/sandbox/agent.js";

describe("runAgent", () => {
  it("returns the exit code from sandbox.attachWith()", async () => {
    mockSandbox.attachWith.mockImplementation(async (_cmd: string, configure: (b: typeof mockBuilder) => typeof mockBuilder) => {
      configure(mockBuilder);
      return 7;
    });
    const result = await runAgent({
      sandbox: mockSandbox as any,
      command: "claude",
      defaultArgs: ["--dangerously-skip-permissions"],
      argv: ["--help"],
      workspaceDir: "/home/user/project",
    });
    expect(result).toBe(7);
    expect(mockSandbox.attachWith).toHaveBeenCalledWith("claude", expect.any(Function));
    expect(mockBuilder.args).toHaveBeenCalledWith(["--dangerously-skip-permissions", "--help"]);
    expect(mockBuilder.cwd).toHaveBeenCalledWith("/home/user/project");
  });

  it("forwards argv merged with defaultArgs", async () => {
    mockSandbox.attachWith.mockImplementation(async (_cmd: string, configure: (b: typeof mockBuilder) => typeof mockBuilder) => {
      configure(mockBuilder);
      return 0;
    });
    await runAgent({
      sandbox: mockSandbox as any,
      command: "bash",
      defaultArgs: [],
      argv: ["-c", "echo hi"],
      workspaceDir: "/tmp",
    });
    expect(mockSandbox.attachWith).toHaveBeenCalledWith("bash", expect.any(Function));
    expect(mockBuilder.args).toHaveBeenCalledWith(["-c", "echo hi"]);
    expect(mockBuilder.cwd).toHaveBeenCalledWith("/tmp");
  });
});
