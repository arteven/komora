import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/sandbox/msb.js", () => ({
  msb: { status: vi.fn() },
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
    expect(runAgent).toHaveBeenCalledWith({ name: "name", agent: "ls", argv: ["-la"] });
    expect(code).toBe(0);
  });
});
