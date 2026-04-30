import { describe, it, expect, vi } from "vitest";
vi.mock("../../src/config/index.js", () => ({ loadResolvedConfig: vi.fn() }));
vi.mock("../../src/sandbox/lifecycle.js", () => ({ ensureSandbox: vi.fn() }));
vi.mock("../../src/sandbox/agent.js", () => ({ runAgent: vi.fn(async () => 42) }));

import { loadResolvedConfig } from "../../src/config/index.js";
import { ensureSandbox } from "../../src/sandbox/lifecycle.js";
import { runAgent } from "../../src/sandbox/agent.js";
import { run } from "../../src/commands/run.js";

describe("run command", () => {
  it("ensures sandbox then runs agent and returns its exit code", async () => {
    (loadResolvedConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      agent: "claude", sandboxName: "foo-claude-nodejs",
    });
    const code = await run({ agent: "claude", argv: ["--help"], workspaceDir: "/tmp/foo" });
    expect(ensureSandbox).toHaveBeenCalled();
    expect(runAgent).toHaveBeenCalledWith({ name: "foo-claude-nodejs", agent: "claude", argv: ["--help"] });
    expect(code).toBe(42);
  });
});
