import { describe, it, expect, vi } from "vitest";

const mockSandbox = vi.hoisted(() => ({
  attach: vi.fn(),
  exec: vi.fn(),
  shell: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("../../src/sandbox/msb.js", () => ({
  msb: {
    status: vi.fn(),
    connect: vi.fn(async () => mockSandbox),
  },
}));
vi.mock("../../src/sandbox/agent.js", () => ({
  runAgent: vi.fn(async () => 0),
}));

import { msb } from "../../src/sandbox/msb.js";
import { runAgent } from "../../src/sandbox/agent.js";
import { exec } from "../../src/commands/exec.js";

describe("exec command", () => {
  it("errors when sandbox not running", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("stopped");
    await expect(exec("name", "ls", [])).rejects.toThrow(/not running/i);
    expect(runAgent).not.toHaveBeenCalled();
  });
  it("runs the command when running", async () => {
    (msb.status as ReturnType<typeof vi.fn>).mockResolvedValue("running");
    const code = await exec("name", "ls", ["-la"]);
    expect(msb.connect).toHaveBeenCalledWith("name");
    expect(runAgent).toHaveBeenCalledWith({ sandbox: mockSandbox, command: "ls", defaultArgs: [], argv: ["-la"], workspaceDir: expect.any(String) });
    expect(code).toBe(0);
  });
});
